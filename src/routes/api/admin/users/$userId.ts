import { createFileRoute } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/admin/users/$userId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          return await updateManagedUser(request, params.userId);
        } catch (error: unknown) {
          /**
           * Nunca registrar:
           *
           * - JWT;
           * - service-role key;
           * - senha;
           * - conteúdo integral do body;
           * - metadados completos do usuário.
           */
          console.error(
            "Erro interno ao editar usuário:",
            error instanceof Error ? error.message : "Erro desconhecido",
          );

          return jsonResponse(
            {
              success: false,
              error: "Não foi possível atualizar o usuário.",
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

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

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

type UpdateUserBody = {
  username?: string;
  nomeCompleto?: string;
  cargo?: CargoUsuario;
  role?: AppRole;
  ativo?: boolean;
};

type UpdateUserSuccessResponse = {
  success: true;
  user: ManagedUser;
};

type ErrorResponse = {
  success: false;
  error: string;
};

type ApiResponse = UpdateUserSuccessResponse | ErrorResponse;

type ParsedUpdateBody =
  | {
      ok: true;
      data: UpdateUserBody;
    }
  | {
      ok: false;
      response: Response;
    };

/**
 * Resposta JSON administrativa sempre não cacheável.
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
 * Aceita UUID canônico sem restringir a versão.
 */
function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function hasOwn(object: Record<string, unknown>, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

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
 * Faz parsing estrito do PATCH.
 *
 * O endpoint aceita somente:
 *
 * - username;
 * - nomeCompleto;
 * - cargo;
 * - role;
 * - ativo.
 *
 * E-mail, senha e must_change_password não podem ser
 * alterados por esta operação.
 */
async function readUpdateUserBody(request: Request): Promise<ParsedUpdateBody> {
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

  const allowedKeys = new Set(["username", "nomeCompleto", "cargo", "role", "ativo"]);

  const keys = Object.keys(record);

  if (keys.length === 0) {
    return {
      ok: false,

      response: jsonResponse(
        {
          success: false,
          error: "Nenhum campo foi informado para atualização.",
        },
        400,
      ),
    };
  }

  const unexpectedKey = keys.find((key) => !allowedKeys.has(key));

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

  const data: UpdateUserBody = {};

  if (hasOwn(record, "username")) {
    if (typeof record.username !== "string") {
      return {
        ok: false,

        response: jsonResponse(
          {
            success: false,

            error: "O usuário informado é inválido.",
          },
          400,
        ),
      };
    }

    const username = normalizeUsername(record.username);

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

    data.username = username;
  }

  if (hasOwn(record, "nomeCompleto")) {
    if (typeof record.nomeCompleto !== "string") {
      return {
        ok: false,

        response: jsonResponse(
          {
            success: false,

            error: "O nome completo informado é inválido.",
          },
          400,
        ),
      };
    }

    const nomeCompleto = record.nomeCompleto.trim();

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

    data.nomeCompleto = nomeCompleto;
  }

  if (hasOwn(record, "cargo")) {
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

    data.cargo = record.cargo;
  }

  if (hasOwn(record, "role")) {
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

    data.role = record.role;
  }

  if (hasOwn(record, "ativo")) {
    if (typeof record.ativo !== "boolean") {
      return {
        ok: false,

        response: jsonResponse(
          {
            success: false,

            error: "O status informado é inválido.",
          },
          400,
        ),
      };
    }

    data.ativo = record.ativo;
  }

  return {
    ok: true,
    data,
  };
}

/**
 * Verifica se existe outro Developer ativo além do usuário
 * que está sendo modificado.
 *
 * Essa proteção impede que uma edição remova o último
 * Developer ativo do sistema.
 */
async function hasAnotherActiveDeveloper(excludedUserId: string): Promise<
  | {
      ok: true;
      exists: boolean;
    }
  | {
      ok: false;
      response: Response;
    }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: developerRoles, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "developer")
    .neq("user_id", excludedUserId);

  if (roleError) {
    console.error("Falha ao verificar outros Developers:", roleError.message);

    return {
      ok: false,

      response: jsonResponse(
        {
          success: false,
          error: "Não foi possível validar a continuidade do acesso administrativo.",
        },
        500,
      ),
    };
  }

  const ids = developerRoles.map((item) => item.user_id);

  if (ids.length === 0) {
    return {
      ok: true,
      exists: false,
    };
  }

  const { data: activeProfiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("id", ids)
    .eq("ativo", true)
    .limit(1);

  if (profileError) {
    console.error("Falha ao verificar Developers ativos:", profileError.message);

    return {
      ok: false,

      response: jsonResponse(
        {
          success: false,
          error: "Não foi possível validar a continuidade do acesso administrativo.",
        },
        500,
      ),
    };
  }

  return {
    ok: true,

    exists: activeProfiles.length > 0,
  };
}

/**
 * ------------------------------------------------------------------
 * PATCH /api/admin/users/:userId
 * ------------------------------------------------------------------
 */
async function updateManagedUser(request: Request, userId: string): Promise<Response> {
  /**
   * --------------------------------------------------------------
   * 1. VALIDAR IDENTIFICADOR
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
   * 2. AUTENTICAR E AUTORIZAR O ATOR
   * --------------------------------------------------------------
   *
   * Somente Developer pode modificar contas existentes.
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
        error: "Você não possui permissão para editar usuários existentes.",
      },
      403,
    );
  }

  /**
   * --------------------------------------------------------------
   * 3. VALIDAR BODY
   * --------------------------------------------------------------
   */
  const parsedBody = await readUpdateUserBody(request);

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const data = parsedBody.data;

  /**
   * --------------------------------------------------------------
   * 4. CARREGAR USUÁRIO ALVO
   * --------------------------------------------------------------
   */
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
      "Falha ao consultar usuário no Supabase Auth:",
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

  const authUser = authUserResult.user;

  const [profileResult, roleResult] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, nome_completo, username, cargo, ativo, must_change_password")
      .eq("id", userId)
      .maybeSingle(),

    supabaseAdmin.from("user_roles").select("user_id, role").eq("user_id", userId).maybeSingle(),
  ]);

  if (profileResult.error) {
    console.error("Falha ao consultar profile do usuário:", profileResult.error.message);

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível consultar o perfil interno do usuário.",
      },
      500,
    );
  }

  if (roleResult.error) {
    console.error("Falha ao consultar role do usuário:", roleResult.error.message);

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível consultar o perfil de acesso do usuário.",
      },
      500,
    );
  }

  const currentProfile = profileResult.data;

  const currentRole = roleResult.data?.role;

  if (!currentProfile || !currentRole) {
    return jsonResponse(
      {
        success: false,
        error: "O cadastro interno deste usuário está incompleto.",
      },
      409,
    );
  }

  /**
   * Preservamos referências já validadas como não nulas.
   *
   * O TypeScript não mantém necessariamente o narrowing de variáveis
   * capturadas por funções assíncronas aninhadas, como o rollback.
   */
  const originalProfile = currentProfile;
  const originalRole = currentRole;

  /**
   * --------------------------------------------------------------
   * 5. CALCULAR ESTADO FINAL
   * --------------------------------------------------------------
   */
  const nextUsername = data.username ?? currentProfile.username;

  const nextName = data.nomeCompleto ?? currentProfile.nome_completo;

  const nextCargo = data.cargo ?? currentProfile.cargo;

  const nextRole = data.role ?? currentRole;

  const nextActive = data.ativo ?? currentProfile.ativo;

  /**
   * Um Developer autenticado nunca pode inativar a própria conta.
   */
  if (actor.user.id === userId && nextActive === false) {
    return jsonResponse(
      {
        success: false,
        error: "Você não pode inativar sua própria conta.",
      },
      409,
    );
  }

  /**
   * Se o usuário atualmente é um Developer ativo e a alteração
   * vai removê-lo dessa condição, precisamos confirmar que
   * existe outro Developer ativo.
   */
  const currentlyActiveDeveloper = currentRole === "developer" && currentProfile.ativo === true;

  const remainsActiveDeveloper = nextRole === "developer" && nextActive === true;

  if (currentlyActiveDeveloper && !remainsActiveDeveloper) {
    const continuity = await hasAnotherActiveDeveloper(userId);

    if (!continuity.ok) {
      return continuity.response;
    }

    if (!continuity.exists) {
      return jsonResponse(
        {
          success: false,
          error:
            "A operação foi bloqueada porque o sistema deve possuir pelo menos um Developer ativo.",
        },
        409,
      );
    }
  }

  /**
   * --------------------------------------------------------------
   * 6. VALIDAR UNICIDADE DO USERNAME
   * --------------------------------------------------------------
   */
  if (
    data.username !== undefined &&
    nextUsername !== null &&
    nextUsername.toLowerCase() !== (currentProfile.username ?? "").toLowerCase()
  ) {
    const { data: existingUsername, error: usernameLookupError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", nextUsername)
      .neq("id", userId)
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
  }

  /**
   * --------------------------------------------------------------
   * 7. PREPARAR ALTERAÇÕES
   * --------------------------------------------------------------
   */
  const profileUpdate: ProfileUpdate = {};

  if (data.username !== undefined) {
    profileUpdate.username = nextUsername;
  }

  if (data.nomeCompleto !== undefined) {
    profileUpdate.nome_completo = nextName;
  }

  if (data.cargo !== undefined) {
    profileUpdate.cargo = nextCargo;
  }

  if (data.ativo !== undefined) {
    profileUpdate.ativo = nextActive;
  }

  const profileNeedsUpdate = Object.keys(profileUpdate).length > 0;

  const roleNeedsUpdate = data.role !== undefined && nextRole !== currentRole;

  const metadataNeedsUpdate =
    data.username !== undefined || data.nomeCompleto !== undefined || data.cargo !== undefined;

  let finalProfile = currentProfile;

  let finalRole = currentRole;

  let profileApplied = false;

  let roleApplied = false;

  /**
   * --------------------------------------------------------------
   * 8. ROLLBACK COMPENSATÓRIO
   * --------------------------------------------------------------
   *
   * As alterações em Auth, profiles e user_roles não fazem parte
   * de uma única transação controlada pelo cliente.
   *
   * Caso uma etapa posterior falhe, tentamos restaurar o estado
   * original das tabelas já modificadas.
   */
  async function rollbackDatabaseChanges() {
    let rollbackFailed = false;

    /**
     * Restauramos primeiro a role porque ela foi a última alteração
     * de banco aplicada no fluxo normal.
     *
     * O rollback segue, portanto, a ordem inversa das alterações.
     */
    if (roleApplied) {
      const { error: roleRollbackError } = await supabaseAdmin
        .from("user_roles")
        .update({
          role: originalRole,
        })
        .eq("user_id", userId);

      if (roleRollbackError) {
        rollbackFailed = true;

        console.error("Falha ao restaurar a role durante rollback:", roleRollbackError.message);
      }
    }

    /**
     * Depois restauramos o profile, caso ele tenha sido
     * modificado anteriormente.
     */
    if (profileApplied) {
      const { error: profileRollbackError } = await supabaseAdmin
        .from("profiles")
        .update({
          nome_completo: originalProfile.nome_completo,

          username: originalProfile.username,

          cargo: originalProfile.cargo,

          ativo: originalProfile.ativo,
        })
        .eq("id", userId);

      if (profileRollbackError) {
        rollbackFailed = true;

        console.error(
          "Falha ao restaurar o profile durante rollback:",
          profileRollbackError.message,
        );
      }
    }

    /**
     * Não expomos dados do usuário nem o conteúdo das operações.
     * O log serve somente para sinalizar inconsistência operacional.
     */
    if (rollbackFailed) {
      console.error("Uma ou mais operações de rollback do usuário não puderam ser concluídas.");
    }
  }
  /**
   * --------------------------------------------------------------
   * 9. ATUALIZAR PROFILE
   * --------------------------------------------------------------
   */
  if (profileNeedsUpdate) {
    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId)
      .select("id, nome_completo, username, cargo, ativo, must_change_password")
      .maybeSingle();

    if (profileError || !updatedProfile) {
      if (profileError?.code === "23505") {
        return jsonResponse(
          {
            success: false,
            error: "Este nome de usuário já está em uso.",
          },
          409,
        );
      }

      console.error(
        "Falha ao atualizar profile do usuário:",
        profileError?.message ?? "Profile não retornado",
      );

      return jsonResponse(
        {
          success: false,
          error: "Não foi possível atualizar o perfil interno do usuário.",
        },
        500,
      );
    }

    finalProfile = updatedProfile;

    profileApplied = true;
  }

  /**
   * --------------------------------------------------------------
   * 10. ATUALIZAR ROLE
   * --------------------------------------------------------------
   */
  if (roleNeedsUpdate) {
    const { data: updatedRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .update({
        role: nextRole,
      })
      .eq("user_id", userId)
      .select("user_id, role")
      .maybeSingle();

    if (roleError || !updatedRole) {
      console.error(
        "Falha ao atualizar role do usuário:",
        roleError?.message ?? "Role não retornada",
      );

      await rollbackDatabaseChanges();

      return jsonResponse(
        {
          success: false,
          error: "Não foi possível atualizar o perfil de acesso do usuário.",
        },
        500,
      );
    }

    finalRole = updatedRole.role;

    roleApplied = true;
  }

  /**
   * --------------------------------------------------------------
   * 11. SINCRONIZAR USER_METADATA
   * --------------------------------------------------------------
   *
   * A fonte funcional continua sendo public.profiles.
   *
   * Mesmo assim, como os dados básicos também foram gravados em
   * user_metadata na criação da conta, mantemos esse conteúdo
   * sincronizado para evitar metadados obsoletos.
   *
   * updateUserById é uma operação administrativa server-side.
   */
  if (metadataNeedsUpdate) {
    const existingMetadata = authUser.user_metadata ?? {};

    const { error: authMetadataError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...existingMetadata,

        nome_completo: nextName,

        username: nextUsername,

        cargo: nextCargo,
      },
    });

    if (authMetadataError) {
      console.error("Falha ao sincronizar user_metadata:", authMetadataError.message);

      await rollbackDatabaseChanges();

      return jsonResponse(
        {
          success: false,
          error:
            "Os dados internos foram alterados, mas não foi possível sincronizar os metadados da conta.",
        },
        500,
      );
    }
  }

  /**
   * --------------------------------------------------------------
   * 12. SUCESSO
   * --------------------------------------------------------------
   */
  const responseUser: ManagedUser = {
    id: authUser.id,

    email: authUser.email ?? null,

    nomeCompleto: finalProfile.nome_completo,

    username: finalProfile.username,

    cargo: finalProfile.cargo,

    ativo: finalProfile.ativo,

    mustChangePassword: finalProfile.must_change_password,

    role: finalRole,

    emailConfirmado: Boolean(authUser.email_confirmed_at),

    criadoEm: authUser.created_at,

    ultimoLoginEm: authUser.last_sign_in_at ?? null,

    cadastroCompleto: true,
  };

  return jsonResponse(
    {
      success: true,

      user: responseUser,
    },
    200,
  );
}
