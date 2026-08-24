import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listManagedUsers(request);
        } catch (error: unknown) {
          /**
           * Nunca registramos JWTs, secrets ou dados completos
           * dos usuários em logs.
           */
          console.error(
            "Erro interno ao listar usuários:",
            error instanceof Error ? error.message : "Erro desconhecido",
          );

          return jsonResponse(
            {
              success: false,
              error: "Não foi possível carregar os usuários.",
            },
            500,
          );
        }
      },
    },
  },
});

type AppRole = Database["public"]["Enums"]["app_role"];

type CargoUsuario = Database["public"]["Enums"]["cargo_usuario"];

type ManagedUser = {
  /**
   * Identificador proveniente de auth.users.
   */
  id: string;

  /**
   * E-mail utilizado atualmente para autenticação.
   *
   * Futuramente o login por username poderá utilizar uma
   * resolução server-side para descobrir esse e-mail sem
   * expor mecanismos administrativos ao navegador.
   */
  email: string | null;

  /**
   * Dados funcionais provenientes de public.profiles.
   */
  nomeCompleto: string | null;
  username: string | null;
  cargo: CargoUsuario | null;
  ativo: boolean | null;
  mustChangePassword: boolean | null;

  /**
   * Papel único proveniente de public.user_roles.
   */
  role: AppRole | null;

  /**
   * Informações operacionais mínimas do Supabase Auth.
   *
   * Não retornamos user_metadata, app_metadata, identities,
   * providers, tokens ou qualquer dado interno desnecessário.
   */
  emailConfirmado: boolean;
  criadoEm: string;
  ultimoLoginEm: string | null;

  /**
   * Indica cadastro inconsistente entre Auth e tabelas internas.
   *
   * Isso será útil para o Developer diagnosticar contas
   * parcialmente criadas ou registros legados.
   */
  cadastroCompleto: boolean;
};

type UsersSuccessResponse = {
  success: true;

  /**
   * Role do usuário que realizou a consulta.
   *
   * A UI poderá usá-la para apresentação, mas as permissões
   * continuam sendo obrigatoriamente aplicadas no servidor.
   */
  actorRole: "developer" | "admin";

  users: ManagedUser[];
};

type ErrorResponse = {
  success: false;
  error: string;
};

type ApiResponse = UsersSuccessResponse | ErrorResponse;

/**
 * Cria respostas JSON não cacheáveis.
 *
 * Dados administrativos não devem ser armazenados em cache
 * compartilhado ou reutilizados por navegadores/proxies.
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

async function listManagedUsers(request: Request): Promise<Response> {
  /**
   * ----------------------------------------------------------------
   * 1. AUTENTICAÇÃO E AUTORIZAÇÃO
   * ----------------------------------------------------------------
   *
   * Import dinâmico deliberado para manter o módulo .server.ts
   * fora do bundle executado pelo navegador.
   */
  const { authenticateManagementActor } = await import("@/lib/server/user-management-auth.server");

  const authentication = await authenticateManagementActor(request);

  if (!authentication.ok) {
    return authentication.response;
  }

  const { actor } = authentication;

  /**
   * ----------------------------------------------------------------
   * 2. CLIENTE ADMINISTRATIVO
   * ----------------------------------------------------------------
   *
   * O service-role client também é carregado somente dentro do
   * handler server-side.
   */
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  /**
   * ----------------------------------------------------------------
   * 3. LISTAR auth.users
   * ----------------------------------------------------------------
   *
   * A API administrativa é paginada. Percorremos todas as páginas
   * em blocos de 100 registros para que a implementação não fique
   * limitada aos primeiros usuários.
   *
   * O sistema atualmente é pequeno, mas dessa forma a API continua
   * correta caso a quantidade aumente no futuro.
   */
  const AUTH_PAGE_SIZE = 100;

  const authUsers: Array<{
    id: string;
    email?: string;
    email_confirmed_at?: string;
    created_at: string;
    last_sign_in_at?: string;
  }> = [];

  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });

    if (error) {
      console.error("Falha ao listar usuários do Supabase Auth:", error.message);

      return jsonResponse(
        {
          success: false,
          error: "Não foi possível consultar os usuários autenticáveis.",
        },
        500,
      );
    }

    const currentPage = data.users;

    authUsers.push(
      ...currentPage.map((user) => ({
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      })),
    );

    /**
     * Página incompleta indica que chegamos ao fim da listagem.
     */
    if (currentPage.length < AUTH_PAGE_SIZE) {
      break;
    }

    page += 1;

    /**
     * Proteção defensiva contra paginação inesperadamente infinita.
     *
     * 10.000 usuários está muito acima da escala prevista para
     * este sistema interno.
     */
    if (page > 100) {
      console.error("Limite defensivo de paginação de usuários atingido.");

      return jsonResponse(
        {
          success: false,
          error: "A listagem de usuários excedeu o limite operacional.",
        },
        500,
      );
    }
  }

  /**
   * Um projeto sem usuários autenticáveis é tecnicamente válido.
   */
  if (authUsers.length === 0) {
    return jsonResponse(
      {
        success: true,
        actorRole: actor.role,
        users: [],
      },
      200,
    );
  }

  /**
   * ----------------------------------------------------------------
   * 4. BUSCAR DADOS FUNCIONAIS
   * ----------------------------------------------------------------
   *
   * Não usamos consultas individuais por usuário.
   *
   * Carregamos profiles e roles em duas consultas em lote,
   * evitando o problema N+1.
   */
  const userIds = authUsers.map((user) => user.id);

  const [profilesResult, rolesResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        ["id", "nome_completo", "username", "cargo", "ativo", "must_change_password"].join(","),
      )
      .in("id", userIds),

    supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
  ]);

  if (profilesResult.error) {
    console.error(
      "Falha ao carregar profiles da listagem administrativa:",
      profilesResult.error.message,
    );

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível consultar os perfis dos usuários.",
      },
      500,
    );
  }

  if (rolesResult.error) {
    console.error("Falha ao carregar roles da listagem administrativa:", rolesResult.error.message);

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível consultar as permissões dos usuários.",
      },
      500,
    );
  }

  /**
   * Índices em memória para combinar as três fontes:
   *
   * auth.users
   * public.profiles
   * public.user_roles
   */
  const profilesById = new Map(profilesResult.data.map((profile) => [profile.id, profile]));

  const rolesByUserId = new Map(
    rolesResult.data.map((userRole) => [userRole.user_id, userRole.role]),
  );

  /**
   * ----------------------------------------------------------------
   * 5. CONSTRUIR DTO SEGURO
   * ----------------------------------------------------------------
   *
   * Não devolvemos o objeto User bruto do Supabase.
   *
   * Retornamos somente os campos efetivamente necessários
   * à futura área administrativa.
   */
  const users: ManagedUser[] = authUsers.map((authUser) => {
    const profile = profilesById.get(authUser.id);

    const role = rolesByUserId.get(authUser.id);

    return {
      id: authUser.id,

      email: authUser.email ?? null,

      nomeCompleto: profile?.nome_completo ?? null,

      username: profile?.username ?? null,

      cargo: profile?.cargo ?? null,

      ativo: profile?.ativo ?? null,

      mustChangePassword: profile?.must_change_password ?? null,

      role: role ?? null,

      emailConfirmado: Boolean(authUser.email_confirmed_at),

      criadoEm: authUser.created_at,

      ultimoLoginEm: authUser.last_sign_in_at ?? null,

      cadastroCompleto: Boolean(profile && role),
    };
  });

  /**
   * Ordenação estável e legível para a futura interface.
   *
   * Preferimos nome completo; na ausência dele, usamos e-mail.
   */
  users.sort((left, right) => {
    const leftLabel = left.nomeCompleto ?? left.email ?? "";

    const rightLabel = right.nomeCompleto ?? right.email ?? "";

    return leftLabel.localeCompare(rightLabel, "pt-BR", {
      sensitivity: "base",
    });
  });

  /**
   * ----------------------------------------------------------------
   * 6. SUCESSO
   * ----------------------------------------------------------------
   */
  return jsonResponse(
    {
      success: true,
      actorRole: actor.role,
      users,
    },
    200,
  );
}
