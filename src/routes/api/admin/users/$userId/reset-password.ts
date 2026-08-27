import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/users/$userId/reset-password")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          return await resetManagedUserPassword(request, params.userId);
        } catch (error: unknown) {
          /**
           * Nunca registrar:
           *
           * - senha temporária;
           * - JWT;
           * - service-role key;
           * - body integral;
           * - credenciais do usuário alvo.
           */
          console.error(
            "Erro interno ao redefinir senha de usuário:",
            error instanceof Error ? error.message : "Erro desconhecido",
          );

          return jsonResponse(
            {
              success: false,
              error: "Não foi possível redefinir a senha do usuário.",
            },
            500,
          );
        }
      },
    },
  },
});

type ResetPasswordBody = {
  temporaryPassword: string;
};

type ResetPasswordSuccessResponse = {
  success: true;

  user: {
    id: string;
    mustChangePassword: true;
  };
};

type ErrorResponse = {
  success: false;
  error: string;
};

type ApiResponse = ResetPasswordSuccessResponse | ErrorResponse;

type ParsedBody =
  | {
      ok: true;
      data: ResetPasswordBody;
    }
  | {
      ok: false;
      response: Response;
    };

/**
 * Resposta administrativa sempre não cacheável.
 */
function jsonResponse(body: ApiResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,

    headers: {
      "Content-Type": "application/json; charset=utf-8",

      "Cache-Control": "no-store",
    },
  });
}

/**
 * Aceita UUID canônico sem restringir sua versão.
 */
function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Mantém a política atualmente adotada pelo sistema:
 *
 * - mínimo de 6 caracteres;
 * - pelo menos uma letra;
 * - pelo menos um número.
 *
 * O Supabase Auth continua podendo aplicar verificações
 * adicionais configuradas no projeto.
 */
function validateTemporaryPassword(password: string): string | null {
  if (password.length < 6) {
    return "A senha temporária deve ter no mínimo 6 caracteres.";
  }

  if (!/\p{L}/u.test(password)) {
    return "A senha temporária deve conter pelo menos uma letra.";
  }

  if (!/[0-9]/.test(password)) {
    return "A senha temporária deve conter pelo menos um número.";
  }

  return null;
}

/**
 * Parsing estrito do body.
 *
 * O endpoint aceita exclusivamente:
 *
 * {
 *   "temporaryPassword": "..."
 * }
 *
 * Não aceitamos userId no body porque o usuário alvo é
 * identificado exclusivamente pelo parâmetro da rota.
 */
async function readResetPasswordBody(request: Request): Promise<ParsedBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,

      response: jsonResponse(
        {
          success: false,
          error: "O corpo da requisição é inválido.",
        },
        400,
      ),
    };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,

      response: jsonResponse(
        {
          success: false,
          error: "O corpo da requisição é inválido.",
        },
        400,
      ),
    };
  }

  const record = body as Record<string, unknown>;

  const keys = Object.keys(record);

  if (keys.length !== 1 || keys[0] !== "temporaryPassword") {
    return {
      ok: false,

      response: jsonResponse(
        {
          success: false,
          error: "A requisição contém campos não permitidos.",
        },
        400,
      ),
    };
  }

  if (typeof record.temporaryPassword !== "string") {
    return {
      ok: false,

      response: jsonResponse(
        {
          success: false,
          error: "A senha temporária informada é inválida.",
        },
        400,
      ),
    };
  }

  const password = record.temporaryPassword;

  const passwordError = validateTemporaryPassword(password);

  if (passwordError) {
    return {
      ok: false,

      response: jsonResponse(
        {
          success: false,
          error: passwordError,
        },
        400,
      ),
    };
  }

  return {
    ok: true,

    data: {
      temporaryPassword: password,
    },
  };
}

/**
 * ------------------------------------------------------------------
 * POST /api/admin/users/:userId/reset-password
 * ------------------------------------------------------------------
 *
 * Fluxo:
 *
 * 1. valida userId;
 * 2. autentica o ator;
 * 3. exige role Developer;
 * 4. valida senha temporária;
 * 5. confirma existência do usuário Auth e profile;
 * 6. marca must_change_password=true;
 * 7. altera a senha no Supabase Auth;
 * 8. se Auth falhar, restaura o valor anterior da flag;
 * 9. retorna sucesso sem jamais retornar a senha.
 */
async function resetManagedUserPassword(request: Request, userId: string): Promise<Response> {
  /**
   * --------------------------------------------------------------
   * 1. IDENTIFICADOR
   * --------------------------------------------------------------
   */
  if (!isValidUuid(userId)) {
    return jsonResponse(
      {
        success: false,
        error: "O identificador do usuário é inválido.",
      },
      400,
    );
  }

  /**
   * --------------------------------------------------------------
   * 2. AUTENTICAÇÃO E AUTORIZAÇÃO
   * --------------------------------------------------------------
   *
   * Reutilizamos a mesma política das demais operações sobre
   * contas existentes: somente Developer.
   */
  const { authenticateManagementActor, canManageExistingUsers } =
    await import("@/lib/server/user-management-auth.server");

  const authentication = await authenticateManagementActor(request);

  if (!authentication.ok) {
    return authentication.response;
  }

  const { actor } = authentication;

  if (!canManageExistingUsers(actor.role)) {
    return jsonResponse(
      {
        success: false,
        error: "Você não possui permissão para redefinir senhas de usuários.",
      },
      403,
    );
  }

  /**
   * --------------------------------------------------------------
   * 3. BODY
   * --------------------------------------------------------------
   */
  const parsedBody = await readResetPasswordBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const { temporaryPassword } = parsedBody.data;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { createAuditedSupabaseAdminClient } =
    await import("@/lib/server/audited-supabase-admin.server");

  /**
   * Cliente exclusivo desta redefinicao administrativa de senha.
   *
   * actor.user.id ja foi validado por
   * authenticateManagementActor().
   *
   * Nenhuma senha e transportada para o mecanismo de auditoria.
   * O contexto registra somente quem alterou o estado administrativo
   * do profile.
   */
  const auditedSupabaseAdmin = createAuditedSupabaseAdminClient(actor.user.id);

  /**
   * --------------------------------------------------------------
   * 4. CONFIRMAR USUÁRIO AUTH
   * --------------------------------------------------------------
   */
  const { data: authUserResult, error: authUserError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (authUserError || !authUserResult.user) {
    if (authUserError?.status === 404) {
      return jsonResponse(
        {
          success: false,
          error: "Usuário não encontrado.",
        },
        404,
      );
    }

    console.error(
      "Falha ao consultar usuário antes da redefinição de senha:",
      authUserError?.message ?? "Usuário ausente",
    );

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível consultar a conta de autenticação.",
      },
      500,
    );
  }

  /**
   * --------------------------------------------------------------
   * 5. CONFIRMAR PROFILE
   * --------------------------------------------------------------
   *
   * A operação depende do profile porque a flag
   * must_change_password será a barreira imediata de acesso
   * até que a senha definitiva seja configurada.
   */
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, deleted_at, must_change_password")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error(
      "Falha ao consultar profile antes da redefinição de senha:",
      profileError.message,
    );

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível consultar o perfil interno do usuário.",
      },
      500,
    );
  }

  if (!profile) {
    return jsonResponse(
      {
        success: false,
        error: "O cadastro interno deste usuário está incompleto.",
      },
      409,
    );
  }

  /**
   * Contas arquivadas nao podem receber uma nova senha
   * temporaria. A restauracao, se existir futuramente,
   * devera ser uma operacao administrativa explicita.
   */
  if (profile.deleted_at !== null) {
    return jsonResponse(
      {
        success: false,
        error: "Esta conta está arquivada e não pode ter a senha redefinida.",
      },
      409,
    );
  }

  const originalMustChangePassword = profile.must_change_password;

  let passwordFlagChanged = false;

  /**
   * --------------------------------------------------------------
   * 6. MARCAR TROCA OBRIGATÓRIA
   * --------------------------------------------------------------
   *
   * A flag é gravada ANTES da alteração da senha.
   *
   * Motivo:
   *
   * se a senha fosse alterada primeiro e o UPDATE do profile
   * falhasse depois, não teríamos a senha anterior para realizar
   * rollback no Supabase Auth.
   *
   * Aqui conseguimos fazer rollback da flag caso a operação
   * de Auth falhe.
   */
  if (originalMustChangePassword !== true) {
    const { data: updatedProfile, error: mandatoryChangeError } = await auditedSupabaseAdmin
      .from("profiles")
      .update({
        must_change_password: true,
      })
      .eq("id", userId)
      .select("id, must_change_password")
      .maybeSingle();

    if (mandatoryChangeError || !updatedProfile) {
      console.error(
        "Falha ao marcar troca obrigatória durante redefinição de senha:",
        mandatoryChangeError?.message ?? "Profile não retornado",
      );

      return jsonResponse(
        {
          success: false,
          error: "Não foi possível preparar a conta para a redefinição de senha.",
        },
        500,
      );
    }

    passwordFlagChanged = true;
  }

  /**
   * --------------------------------------------------------------
   * 7. ALTERAR A SENHA NO AUTH
   * --------------------------------------------------------------
   *
   * Operação executada somente pelo cliente server-side com
   * credencial administrativa.
   *
   * A senha nunca é persistida em public.profiles.
   */
  const { error: passwordUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
  });

  if (passwordUpdateError) {
    console.error(
      "Falha ao atualizar senha temporária no Supabase Auth:",
      passwordUpdateError.message,
    );

    /**
     * ------------------------------------------------------------
     * 8. ROLLBACK COMPENSATÓRIO
     * ------------------------------------------------------------
     *
     * Se fomos nós que alteramos a flag nesta requisição,
     * tentamos restaurar seu estado anterior.
     *
     * Caso ela já fosse true antes, não devemos modificá-la.
     */
    if (passwordFlagChanged) {
      const { error: flagRollbackError } = await auditedSupabaseAdmin
        .from("profiles")
        .update({
          must_change_password: originalMustChangePassword,
        })
        .eq("id", userId);

      if (flagRollbackError) {
        console.error(
          "Falha ao restaurar must_change_password após erro no Auth:",
          flagRollbackError.message,
        );
      }
    }

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível definir a nova senha temporária.",
      },
      500,
    );
  }

  /**
   * --------------------------------------------------------------
   * 9. SUCESSO
   * --------------------------------------------------------------
   *
   * Não retornamos:
   *
   * - senha;
   * - hashes;
   * - tokens;
   * - metadados de autenticação desnecessários.
   */
  return jsonResponse(
    {
      success: true,

      user: {
        id: userId,

        mustChangePassword: true,
      },
    },
    200,
  );
}
