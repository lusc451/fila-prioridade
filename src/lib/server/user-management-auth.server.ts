import { createClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type ManagementRole = Extract<AppRole, "developer" | "admin">;

export type ManagementActor = {
  user: User;
  role: ManagementRole;
  profile: {
    id: string;
    nome_completo: string;
    ativo: boolean;
    must_change_password: boolean;
  };
};

export type ManagementAuthResult =
  | {
      ok: true;
      actor: ManagementActor;
    }
  | {
      ok: false;
      response: Response;
    };

type ErrorBody = {
  success: false;
  error: string;
};

/**
 * Resposta JSON padronizada para falhas de autenticação/autorização.
 */
function errorResponse(error: string, status: number): Response {
  const body: ErrorBody = {
    success: false,
    error,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Recupera variável obrigatória do ambiente server-side.
 *
 * Nunca inclui o valor da variável em mensagens ou logs.
 */
function getRequiredServerEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variável server-side obrigatória ausente: ${name}`);
  }

  return value;
}

/**
 * Extrai exclusivamente tokens no formato:
 *
 * Authorization: Bearer <JWT>
 */
function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    return null;
  }

  const token = match[1].trim();

  return token || null;
}

/**
 * Cria um cliente sem persistência de sessão somente para
 * validar o JWT enviado pelo usuário.
 *
 * O token nunca é decodificado localmente como fonte de verdade.
 * auth.getUser(token) valida o token junto ao Supabase Auth.
 */
function createAuthValidationClient() {
  const supabaseUrl = getRequiredServerEnv("SUPABASE_URL");

  const publishableKey = getRequiredServerEnv("SUPABASE_PUBLISHABLE_KEY");

  return createClient<Database>(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Autentica e autoriza um usuário que pretende acessar
 * funcionalidades de gerenciamento de contas.
 *
 * Requisitos obrigatórios:
 *
 * - JWT válido;
 * - auth.users existente;
 * - profile existente;
 * - profile ativo;
 * - troca obrigatória de senha concluída;
 * - exatamente uma role;
 * - role developer ou admin.
 *
 * Usuários comuns nunca passam por este guard.
 */
export async function authenticateManagementActor(request: Request): Promise<ManagementAuthResult> {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return {
      ok: false,
      response: errorResponse("Não autenticado.", 401),
    };
  }

  const authClient = createAuthValidationClient();

  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);

  const user = userData.user;

  if (userError || !user) {
    return {
      ok: false,
      response: errorResponse("Não autenticado.", 401),
    };
  }

  /**
   * Import dinâmico deliberado:
   *
   * mantém o cliente service-role restrito ao código executado
   * exclusivamente no servidor.
   */
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [profileResult, roleResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(["id", "nome_completo", "ativo", "must_change_password"].join(","))
      .eq("id", user.id)
      .maybeSingle(),

    supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
  ]);

  if (profileResult.error) {
    console.error(
      "Falha ao consultar profile do usuário administrativo:",
      profileResult.error.message,
    );

    return {
      ok: false,
      response: errorResponse("Não foi possível validar o perfil da conta.", 500),
    };
  }

  if (roleResult.error) {
    console.error("Falha ao consultar role do usuário administrativo:", roleResult.error.message);

    return {
      ok: false,
      response: errorResponse("Não foi possível validar as permissões da conta.", 500),
    };
  }

  const profile = profileResult.data;

  const role = roleResult.data?.role;

  if (!profile) {
    return {
      ok: false,
      response: errorResponse("Perfil da conta não encontrado.", 403),
    };
  }

  if (profile.ativo !== true) {
    return {
      ok: false,
      response: errorResponse("Esta conta está inativa.", 403),
    };
  }

  if (profile.must_change_password === true) {
    return {
      ok: false,
      response: errorResponse("A troca obrigatória de senha ainda está pendente.", 403),
    };
  }

  if (!role) {
    return {
      ok: false,
      response: errorResponse("A conta não possui perfil de acesso.", 403),
    };
  }

  if (role !== "developer" && role !== "admin") {
    return {
      ok: false,
      response: errorResponse("Você não possui permissão para gerenciar usuários.", 403),
    };
  }

  return {
    ok: true,
    actor: {
      user,
      role,
      profile: {
        id: profile.id,
        nome_completo: profile.nome_completo,
        ativo: profile.ativo,
        must_change_password: profile.must_change_password,
      },
    },
  };
}

/**
 * Define se o ator pode criar determinada role.
 *
 * Regras:
 *
 * Developer:
 * - developer
 * - admin
 * - usuario
 *
 * Admin:
 * - admin
 * - usuario
 *
 * Nenhum Admin pode criar/promover Developer.
 */
export function canCreateRole(actorRole: ManagementRole, targetRole: AppRole): boolean {
  if (actorRole === "developer") {
    return targetRole === "developer" || targetRole === "admin" || targetRole === "usuario";
  }

  return targetRole === "admin" || targetRole === "usuario";
}

/**
 * Operações sobre usuários existentes são reservadas ao Developer.
 *
 * Será utilizada posteriormente para:
 *
 * - edição;
 * - exclusão;
 * - ativação/inativação;
 * - alteração de role;
 * - redefinição administrativa de senha.
 */
export function canManageExistingUsers(actorRole: ManagementRole): boolean {
  return actorRole === "developer";
}
