import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listManagedUsers(request);
        } catch (error: unknown) {
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

      POST: async ({ request }) => {
        try {
          return await createManagedUser(request);
        } catch (error: unknown) {
          /**
           * Nunca registrar:
           *
           * - senha temporária;
           * - JWT;
           * - service role key;
           * - conteúdo integral do body.
           */
          console.error(
            "Erro interno ao criar usuário:",
            error instanceof Error ? error.message : "Erro desconhecido",
          );

          return jsonResponse(
            {
              success: false,
              error: "Não foi possível criar o usuário.",
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

type ManagementRole = Extract<AppRole, "developer" | "admin">;

type ManagedUser = {
  id: string;
  email: string | null;

  nomeCompleto: string | null;

  username: string | null;

  cargo: CargoUsuario | null;

  ativo: boolean | null;

  mustChangePassword: boolean | null;

  role: AppRole | null;

  emailConfirmado: boolean;
  criadoEm: string;

  ultimoLoginEm: string | null;

  cadastroCompleto: boolean;
};

type CreateUserBody = {
  /**
   * E-mail utilizado pelo Supabase Auth e pela
   * recuperação de senha.
   */
  email: string;

  /**
   * Identificador interno preferencial da aplicação.
   */
  username: string;

  nomeCompleto: string;
  cargo: CargoUsuario;
  role: AppRole;

  /**
   * Senha usada exclusivamente no primeiro acesso.
   *
   * O profile será criado com must_change_password=true.
   */
  temporaryPassword: string;
};

type UsersSuccessResponse = {
  success: true;
  actorRole: ManagementRole;
  users: ManagedUser[];
};

type CreateUserSuccessResponse = {
  success: true;
  user: ManagedUser;
};

type ErrorResponse = {
  success: false;
  error: string;
};

type ApiResponse = UsersSuccessResponse | CreateUserSuccessResponse | ErrorResponse;

/**
 * Gera uma resposta JSON explicitamente não cacheável.
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
 * ------------------------------------------------------------------
 * VALIDAÇÕES DE CRIAÇÃO
 * ------------------------------------------------------------------
 */

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/**
 * Repete as mesmas restrições estabelecidas no banco:
 *
 * - 3 a 32 caracteres;
 * - primeiro caractere alfanumérico;
 * - letras minúsculas;
 * - números;
 * - ponto;
 * - underline;
 * - hífen.
 *
 * A constraint/índice do PostgreSQL continua sendo a
 * última barreira de consistência.
 */
function isValidUsername(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value);
}

function isCargoUsuario(value: unknown): value is CargoUsuario {
  return value === "enfermeiro" || value === "tecnico_enfermagem" || value === "recepcao";
}

function isAppRole(value: unknown): value is AppRole {
  return value === "developer" || value === "admin" || value === "usuario";
}

/**
 * Mantém a política definida para senhas do sistema:
 *
 * - mínimo de 6 caracteres;
 * - ao menos uma letra;
 * - ao menos um número.
 *
 * O Supabase Auth continua responsável por regras adicionais,
 * inclusive verificações configuradas na plataforma.
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
 * Faz parsing estrito do body.
 *
 * Campos extras são rejeitados deliberadamente.
 */
async function readCreateUserBody(request: Request): Promise<
  | {
      ok: true;
      data: CreateUserBody;
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

  const allowedKeys = new Set([
    "email",
    "username",
    "nomeCompleto",
    "cargo",
    "role",
    "temporaryPassword",
  ]);

  const unexpectedKey = Object.keys(record).find((key) => !allowedKeys.has(key));

  if (unexpectedKey) {
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

  if (
    typeof record.email !== "string" ||
    typeof record.username !== "string" ||
    typeof record.nomeCompleto !== "string" ||
    typeof record.temporaryPassword !== "string"
  ) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error: "Os dados informados são inválidos.",
        },
        400,
      ),
    };
  }

  if (!isCargoUsuario(record.cargo)) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error: "O cargo informado é inválido.",
        },
        400,
      ),
    };
  }

  if (!isAppRole(record.role)) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error: "O perfil de acesso informado é inválido.",
        },
        400,
      ),
    };
  }

  const email = normalizeEmail(record.email);

  const username = normalizeUsername(record.username);

  const nomeCompleto = record.nomeCompleto.trim();

  if (!isValidEmail(email)) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error: "Informe um e-mail válido.",
        },
        400,
      ),
    };
  }

  if (!isValidUsername(username)) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error:
            "O usuário deve possuir entre 3 e 32 caracteres, começar com letra ou número e utilizar apenas letras minúsculas, números, ponto, hífen ou underline.",
        },
        400,
      ),
    };
  }

  if (nomeCompleto.length < 3 || nomeCompleto.length > 150) {
    return {
      ok: false,
      response: jsonResponse(
        {
          success: false,
          error: "O nome completo deve possuir entre 3 e 150 caracteres.",
        },
        400,
      ),
    };
  }

  const passwordError = validateTemporaryPassword(record.temporaryPassword);

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
      email,
      username,
      nomeCompleto,
      cargo: record.cargo,
      role: record.role,
      temporaryPassword: record.temporaryPassword,
    },
  };
}

/**
 * Tenta remover um auth.users recém-criado caso uma etapa
 * posterior da criação administrativa falhe.
 *
 * Como profile e user_roles referenciam auth.users com cascade,
 * a remoção do usuário Auth também limpa os registros relacionados.
 */
async function rollbackCreatedUser(userId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error("Falha ao executar rollback de usuário recém-criado:", error.message);
    }
  } catch (error: unknown) {
    console.error(
      "Falha inesperada no rollback de usuário recém-criado:",
      error instanceof Error ? error.message : "Erro desconhecido",
    );
  }
}

/**
 * ------------------------------------------------------------------
 * GET /api/admin/users
 * ------------------------------------------------------------------
 */

async function listManagedUsers(request: Request): Promise<Response> {
  const { authenticateManagementActor } = await import("@/lib/server/user-management-auth.server");

  const authentication = await authenticateManagementActor(request);

  if (!authentication.ok) {
    return authentication.response;
  }

  const { actor } = authentication;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

    if (currentPage.length < AUTH_PAGE_SIZE) {
      break;
    }

    page += 1;

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

  const profilesById = new Map(profilesResult.data.map((profile) => [profile.id, profile]));

  const rolesByUserId = new Map(
    rolesResult.data.map((userRole) => [userRole.user_id, userRole.role]),
  );

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

  users.sort((left, right) => {
    const leftLabel = left.nomeCompleto ?? left.email ?? "";

    const rightLabel = right.nomeCompleto ?? right.email ?? "";

    return leftLabel.localeCompare(rightLabel, "pt-BR", {
      sensitivity: "base",
    });
  });

  return jsonResponse(
    {
      success: true,
      actorRole: actor.role,
      users,
    },
    200,
  );
}

/**
 * ------------------------------------------------------------------
 * POST /api/admin/users
 * ------------------------------------------------------------------
 */

async function createManagedUser(request: Request): Promise<Response> {
  /**
   * 1. Autenticar e autorizar o ator.
   */
  const { authenticateManagementActor, canCreateRole } =
    await import("@/lib/server/user-management-auth.server");

  const authentication = await authenticateManagementActor(request);

  if (!authentication.ok) {
    return authentication.response;
  }

  const { actor } = authentication;

  /**
   * 2. Validar o body.
   */
  const parsedBody = await readCreateUserBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const data = parsedBody.data;

  /**
   * 3. Aplicar autorização da role solicitada.
   *
   * Developer:
   *   developer/admin/usuario
   *
   * Admin:
   *   admin/usuario
   */
  if (!canCreateRole(actor.role, data.role)) {
    return jsonResponse(
      {
        success: false,
        error: "Você não possui permissão para criar usuários com este perfil de acesso.",
      },
      403,
    );
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  /**
   * 4. Verificar previamente a unicidade do username.
   *
   * O índice UNIQUE do PostgreSQL continua sendo a garantia
   * definitiva contra condições de corrida.
   */
  const { data: existingUsername, error: usernameLookupError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("username", data.username)
    .maybeSingle();

  if (usernameLookupError) {
    console.error("Falha ao verificar disponibilidade do username:", usernameLookupError.message);

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível verificar a disponibilidade do usuário.",
      },
      500,
    );
  }

  if (existingUsername) {
    return jsonResponse(
      {
        success: false,
        error: "Este nome de usuário já está em uso.",
      },
      409,
    );
  }

  /**
   * 5. Criar auth.users.
   *
   * email_confirm=true é deliberado:
   *
   * - trata-se de cadastro administrativo interno;
   * - o criador já definiu a senha temporária;
   * - o usuário deverá obrigatoriamente substituir essa senha
   *   no primeiro acesso.
   *
   * O trigger handle_new_user() criará:
   *
   * - public.profiles;
   * - public.user_roles inicialmente como usuario.
   */
  const { data: createAuthData, error: createAuthError } =
    await supabaseAdmin.auth.admin.createUser({
      email: data.email,

      password: data.temporaryPassword,

      email_confirm: true,

      user_metadata: {
        nome_completo: data.nomeCompleto,

        username: data.username,

        cargo: data.cargo,
      },
    });

  if (createAuthError || !createAuthData.user) {
    const message = createAuthError?.message ?? "";

    const normalizedMessage = message.toLowerCase();

    const isDuplicateEmail =
      normalizedMessage.includes("already") ||
      normalizedMessage.includes("registered") ||
      normalizedMessage.includes("exists");

    return jsonResponse(
      {
        success: false,
        error: isDuplicateEmail
          ? "Já existe uma conta cadastrada com este e-mail."
          : "Não foi possível criar a conta de autenticação.",
      },
      isDuplicateEmail ? 409 : 400,
    );
  }

  const createdUser = createAuthData.user;

  /**
   * A partir deste ponto existe um auth.users.
   *
   * Qualquer falha posterior deve tentar remover essa conta
   * para evitar cadastro parcialmente configurado.
   */
  let creationCompleted = false;

  try {
    /**
     * 6. Confirmar/normalizar o profile criado pelo trigger.
     *
     * Não confiamos somente nos metadados.
     * Gravamos explicitamente os valores funcionais finais.
     */
    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        nome_completo: data.nomeCompleto,

        username: data.username,

        cargo: data.cargo,

        ativo: true,

        must_change_password: true,
      })
      .eq("id", createdUser.id)
      .select(
        ["id", "nome_completo", "username", "cargo", "ativo", "must_change_password"].join(","),
      )
      .maybeSingle();

    if (profileError || !updatedProfile) {
      console.error(
        "Falha ao configurar profile de usuário recém-criado:",
        profileError?.message ?? "Profile não encontrado após criação do Auth.",
      );

      return jsonResponse(
        {
          success: false,
          error: "A conta foi criada, mas não foi possível configurar o perfil interno.",
        },
        500,
      );
    }

    /**
     * 7. Definir exatamente uma role.
     *
     * O trigger cria inicialmente "usuario".
     * O upsert converte essa role para o perfil solicitado.
     *
     * Existe índice UNIQUE(user_id), portanto uma conta nunca
     * deve acumular múltiplas roles.
     */
    const { data: configuredRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          user_id: createdUser.id,

          role: data.role,
        },
        {
          onConflict: "user_id",
        },
      )
      .select("user_id, role")
      .maybeSingle();

    if (roleError || !configuredRole) {
      console.error(
        "Falha ao configurar role de usuário recém-criado:",
        roleError?.message ?? "Role não encontrada após criação.",
      );

      return jsonResponse(
        {
          success: false,
          error: "A conta foi criada, mas não foi possível configurar o perfil de acesso.",
        },
        500,
      );
    }

    creationCompleted = true;

    /**
     * 8. Retornar somente o DTO administrativo seguro.
     */
    const responseUser: ManagedUser = {
      id: createdUser.id,

      email: createdUser.email ?? data.email,

      nomeCompleto: updatedProfile.nome_completo,

      username: updatedProfile.username,

      cargo: updatedProfile.cargo,

      ativo: updatedProfile.ativo,

      mustChangePassword: updatedProfile.must_change_password,

      role: configuredRole.role,

      emailConfirmado: Boolean(createdUser.email_confirmed_at),

      criadoEm: createdUser.created_at,

      ultimoLoginEm: createdUser.last_sign_in_at ?? null,

      cadastroCompleto: true,
    };

    return jsonResponse(
      {
        success: true,
        user: responseUser,
      },
      201,
    );
  } finally {
    /**
     * Rollback compensatório.
     *
     * Auth e as alterações posteriores não fazem parte de uma
     * única transação controlada pela aplicação.
     *
     * Caso qualquer etapa após createUser() não conclua,
     * removemos o auth.users recém-criado.
     */
    if (!creationCompleted) {
      await rollbackCreatedUser(createdUser.id);
    }
  }
}
