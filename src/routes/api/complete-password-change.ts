import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Endpoint responsável exclusivamente pela conclusão da troca
 * obrigatória de senha temporária.
 *
 * Fluxo:
 *
 * 1. valida o JWT recebido no header Authorization;
 * 2. identifica o usuário exclusivamente através desse JWT;
 * 3. consulta o profile do próprio usuário;
 * 4. confirma que a conta está ativa;
 * 5. confirma que must_change_password = true;
 * 6. valida a senha temporária atual;
 * 7. valida a nova senha;
 * 8. altera a senha através de uma sessão autenticada;
 * 9. somente após o sucesso, define must_change_password = false.
 *
 * O endpoint nunca aceita user_id, email, role ou qualquer outro
 * identificador de usuário enviado pelo cliente.
 */
export const Route = createFileRoute(
  "/api/complete-password-change",
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await completePasswordChange(request);
        } catch (error: unknown) {
          /**
           * Não incluímos dados sensíveis no log.
           *
           * Em especial, currentPassword e newPassword nunca são
           * registrados.
           */
          console.error(
            "Erro interno ao concluir troca obrigatória de senha:",
            error instanceof Error
              ? error.message
              : "Erro desconhecido",
          );

          return jsonResponse(
            {
              success: false,
              error:
                "Não foi possível concluir a troca de senha.",
            },
            500,
          );
        }
      },
    },
  },
});

type PasswordChangeBody = {
  currentPassword: string;
  newPassword: string;
};

type ApiResponse =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Cria uma resposta JSON sem cache.
 *
 * A rota é consumida pelo próprio frontend através de /api/...,
 * portanto não precisamos abrir CORS para origens externas.
 */
function jsonResponse(
  body: ApiResponse,
  status: number,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Recupera uma variável obrigatória do ambiente server-side.
 *
 * Nenhum valor da variável é incluído na mensagem de erro.
 */
function getRequiredServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Variável server-side obrigatória ausente: ${name}`,
    );
  }

  return value;
}

/**
 * Extrai o JWT do padrão:
 *
 * Authorization: Bearer <token>
 *
 * A identidade do usuário será determinada somente através
 * desse token.
 */
function extractBearerToken(
  request: Request,
): string | null {
  const authorization =
    request.headers.get("Authorization");

  if (!authorization) {
    return null;
  }

  const match =
    authorization.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    return null;
  }

  const token = match[1].trim();

  return token || null;
}

/**
 * Lê e valida o corpo da requisição.
 *
 * Aceitamos exclusivamente:
 *
 * {
 *   currentPassword: string,
 *   newPassword: string
 * }
 *
 * Dessa forma, nem mesmo campos extras de identidade são
 * silenciosamente aceitos.
 */
async function readBody(
  request: Request,
): Promise<
  | {
      ok: true;
      data: PasswordChangeBody;
    }
  | {
      ok: false;
      response: Response;
    }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error:
            "O corpo da requisição é inválido.",
        },
        400,
      ),
    };
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error:
            "O corpo da requisição é inválido.",
        },
        400,
      ),
    };
  }

  const record =
    body as Record<string, unknown>;

  const allowedKeys = new Set([
    "currentPassword",
    "newPassword",
  ]);

  const hasUnexpectedField =
    Object.keys(record).some(
      (key) => !allowedKeys.has(key),
    );

  if (hasUnexpectedField) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error:
            "A requisição contém campos não permitidos.",
        },
        400,
      ),
    };
  }

  if (
    typeof record.currentPassword !== "string" ||
    typeof record.newPassword !== "string"
  ) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error:
            "As senhas informadas são inválidas.",
        },
        400,
      ),
    };
  }

  return {
    ok: true,
    data: {
      currentPassword:
        record.currentPassword,
      newPassword: record.newPassword,
    },
  };
}

/**
 * Valida somente as regras que também configuramos no
 * Supabase Auth/Lovable:
 *
 * - mínimo de 6 caracteres;
 * - pelo menos uma letra;
 * - pelo menos um número.
 *
 * As demais verificações de segurança continuam sendo
 * responsabilidade do Supabase Auth, inclusive HIBP.
 */
function validateNewPassword(
  currentPassword: string,
  newPassword: string,
): string | null {
  if (newPassword.length < 6) {
    return "A nova senha deve ter no mínimo 6 caracteres.";
  }

  /**
   * \p{L} reconhece letras Unicode, incluindo letras
   * acentuadas, sem depender de intervalos manuais frágeis.
   */
  if (!/\p{L}/u.test(newPassword)) {
    return "A nova senha deve conter pelo menos uma letra.";
  }

  if (!/[0-9]/.test(newPassword)) {
    return "A nova senha deve conter pelo menos um número.";
  }

  /**
   * A senha temporária é efetivamente de uso único.
   *
   * Não permitimos que a nova senha seja idêntica à senha
   * utilizada para o primeiro acesso.
   */
  if (newPassword === currentPassword) {
    return "A nova senha deve ser diferente da senha temporária.";
  }

  return null;
}

async function completePasswordChange(
  request: Request,
): Promise<Response> {
  /**
   * ----------------------------------------------------------------
   * 1. VALIDAR JWT
   * ----------------------------------------------------------------
   */

  const accessToken =
    extractBearerToken(request);

  if (!accessToken) {
    return jsonResponse(
      {
        success: false,
        error: "Não autenticado.",
      },
      401,
    );
  }

  const supabaseUrl =
    getRequiredServerEnv("SUPABASE_URL");

  const supabasePublishableKey =
    getRequiredServerEnv(
      "SUPABASE_PUBLISHABLE_KEY",
    );

  /**
   * Cliente sem sessão persistida.
   *
   * Ele será usado inicialmente somente para validar o JWT
   * recebido através de auth.getUser(accessToken).
   */
  const authClient = createClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  /**
   * getUser(accessToken) consulta o servidor Auth e valida
   * efetivamente o token.
   *
   * Não confiamos apenas no conteúdo local do JWT.
   */
  const {
    data: userData,
    error: userError,
  } = await authClient.auth.getUser(
    accessToken,
  );

  const user = userData.user;

  if (userError || !user) {
    return jsonResponse(
      {
        success: false,
        error: "Não autenticado.",
      },
      401,
    );
  }

  /**
   * ----------------------------------------------------------------
   * 2. CONSULTAR O PROFILE
   * ----------------------------------------------------------------
   *
   * Aqui usamos o cliente administrativo porque nossa RLS
   * propositalmente esconde profiles inativos.
   *
   * O uso continua seguro porque o ID consultado NÃO vem do
   * body: ele vem exclusivamente do usuário obtido através
   * do JWT validado.
   */

  const { supabaseAdmin } =
    await import(
      "@/integrations/supabase/client.server"
    );

  const {
    data: profile,
    error: profileError,
  } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, ativo, must_change_password",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Falha ao consultar profile durante troca obrigatória de senha:",
      profileError.message,
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Não foi possível verificar o perfil do usuário.",
      },
      500,
    );
  }

  if (!profile) {
    return jsonResponse(
      {
        success: false,
        error:
          "Perfil do usuário não encontrado.",
      },
      404,
    );
  }

  if (profile.ativo !== true) {
    return jsonResponse(
      {
        success: false,
        error:
          "Esta conta está inativa.",
      },
      403,
    );
  }

  /**
   * Este endpoint NÃO funciona como mecanismo genérico
   * para alteração de senha.
   */
  if (
    profile.must_change_password !== true
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Não existe troca obrigatória de senha pendente para esta conta.",
      },
      403,
    );
  }

  /**
   * ----------------------------------------------------------------
   * 3. VALIDAR O BODY
   * ----------------------------------------------------------------
   */

  const parsedBody =
    await readBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const {
    currentPassword,
    newPassword,
  } = parsedBody.data;

  const passwordValidationError =
    validateNewPassword(
      currentPassword,
      newPassword,
    );

  if (passwordValidationError) {
    return jsonResponse(
      {
        success: false,
        error:
          passwordValidationError,
      },
      400,
    );
  }

  /**
   * ----------------------------------------------------------------
   * 4. CONFIRMAR A SENHA TEMPORÁRIA ATUAL
   * ----------------------------------------------------------------
   *
   * O JWT prova que existe uma sessão autenticada, mas queremos
   * garantir também que o usuário conhece a senha temporária
   * atual antes de substituí-la.
   */

  if (!user.email) {
    return jsonResponse(
      {
        success: false,
        error:
          "A conta autenticada não possui e-mail associado.",
      },
      500,
    );
  }

  /**
   * Este cliente será autenticado explicitamente com a senha
   * temporária fornecida.
   *
   * persistSession=false garante que nenhuma sessão seja
   * armazenada no servidor entre requisições.
   */
  const passwordClient =
    createClient<Database>(
      supabaseUrl,
      supabasePublishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

  const {
    data: signInData,
    error: signInError,
  } =
    await passwordClient.auth.signInWithPassword(
      {
        email: user.email,
        password: currentPassword,
      },
    );

  if (
    signInError ||
    !signInData.user ||
    !signInData.session
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "A senha temporária atual está incorreta.",
      },
      400,
    );
  }

  /**
   * Defesa adicional:
   *
   * mesmo usando o e-mail obtido do JWT validado, confirmamos
   * que a autenticação da senha corresponde exatamente ao
   * mesmo usuário.
   */
  if (
    signInData.user.id !== user.id
  ) {
    return jsonResponse(
      {
        success: false,
        error:
          "Não foi possível validar a conta autenticada.",
      },
      401,
    );
  }

  /**
   * ----------------------------------------------------------------
   * 5. ALTERAR A SENHA
   * ----------------------------------------------------------------
   *
   * signInWithPassword criou uma sessão real no passwordClient.
   * Portanto updateUser() agora trabalha no contexto autenticado
   * do próprio usuário e continua sujeito às regras normais do
   * Supabase Auth.
   */

  const { error: updatePasswordError } =
    await passwordClient.auth.updateUser({
      password: newPassword,
    });

  if (updatePasswordError) {
    console.error(
      "Supabase Auth rejeitou a nova senha:",
      updatePasswordError.message,
    );

    return jsonResponse(
      {
        success: false,
        error:
          "A nova senha não atende aos critérios de segurança.",
      },
      400,
    );
  }

  /**
   * ----------------------------------------------------------------
   * 6. CONCLUIR O PRIMEIRO ACESSO
   * ----------------------------------------------------------------
   *
   * A flag somente é removida DEPOIS que o Supabase Auth
   * confirmou a alteração da senha.
   */

  const { error: flagError } =
    await supabaseAdmin
      .from("profiles")
      .update({
        must_change_password: false,
      })
      .eq("id", user.id);

  if (flagError) {
    console.error(
      "Senha alterada, mas houve falha ao remover must_change_password:",
      flagError.message,
    );

    /**
     * Mantemos a flag true em caso de erro.
     *
     * Isso é fail-safe: o usuário continua bloqueado até o
     * processo ser concluído corretamente.
     */
    return jsonResponse(
      {
        success: false,
        error:
          "A senha foi alterada, mas não foi possível concluir o primeiro acesso. Tente novamente utilizando a nova senha como senha atual.",
      },
      500,
    );
  }

  /**
   * ----------------------------------------------------------------
   * 7. SUCESSO
   * ----------------------------------------------------------------
   */

  return jsonResponse(
    {
      success: true,
    },
    200,
  );
}