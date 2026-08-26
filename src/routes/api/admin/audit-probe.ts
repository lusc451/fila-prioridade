import { createFileRoute } from "@tanstack/react-router";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Extensão LOCAL do schema gerado.
 *
 * `resolve_audit_actor()` existe no PostgreSQL, porém ainda não aparece
 * em src/integrations/supabase/types.ts.
 *
 * Não modificamos o arquivo gerado manualmente. Para este endpoint
 * diagnóstico temporário, acrescentamos somente a assinatura necessária.
 */
type AuditProbeDatabase = Database & {
  public: Database["public"] & {
    Functions: Database["public"]["Functions"] & {
      resolve_audit_actor: {
        Args: never;
        Returns: string | null;
      };
    };
  };
};

/**
 * Estrutura retornada pelo probe.
 *
 * Nenhuma informação secreta é incluída:
 *
 * - não retorna JWT;
 * - não retorna service role key;
 * - não retorna API key;
 * - não retorna headers completos;
 * - não retorna senha.
 */
type AuditProbeSuccessResponse = {
  success: true;
  expectedActorId: string;
  resolvedActorId: string | null;
  matches: boolean;
  actorRole: "developer";
};

type AuditProbeErrorResponse = {
  success: false;
  error: string;
};

type AuditProbeResponse = AuditProbeSuccessResponse | AuditProbeErrorResponse;

/**
 * Retorna JSON sem cache.
 */
function jsonResponse(body: AuditProbeResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",

      "Cache-Control": "no-store",
    },
  });
}

/**
 * Executa o diagnóstico do contexto de auditoria.
 *
 * Fluxo:
 *
 * 1. autentica o usuário por JWT;
 * 2. valida profile/role/situação da conta;
 * 3. restringe o endpoint ao Developer;
 * 4. cria cliente administrativo exclusivo da requisição;
 * 5. adiciona x-audit-actor-id;
 * 6. chama resolve_audit_actor();
 * 7. compara o UUID esperado com o UUID resolvido pelo PostgreSQL.
 */
async function runAuditProbe(request: Request): Promise<Response> {
  /**
   * Import dinâmico deliberado.
   *
   * O módulo é server-only e não deve entrar no bundle do navegador.
   */
  const { authenticateManagementActor } = await import("@/lib/server/user-management-auth.server");

  const authentication = await authenticateManagementActor(request);

  if (!authentication.ok) {
    return authentication.response;
  }

  const actor = authentication.actor;

  /**
   * O endpoint é exclusivamente diagnóstico e ficará disponível
   * apenas para Developer.
   *
   * Embora Admin seja uma role administrativa válida para outras
   * operações, ele não precisa acessar infraestrutura de diagnóstico.
   */
  if (actor.role !== "developer") {
    return jsonResponse(
      {
        success: false,
        error: "Você não possui permissão para executar este diagnóstico.",
      },
      403,
    );
  }

  /**
   * Outro import dinâmico server-only.
   */
  const { createAuditedSupabaseAdminClient } =
    await import("@/lib/server/audited-supabase-admin.server");

  /**
   * Este é exatamente o mesmo factory utilizado atualmente no
   * PATCH administrativo de profiles.
   */
  const baseClient = createAuditedSupabaseAdminClient(actor.user.id);

  /**
   * A função existe no banco, mas ainda não consta nos tipos gerados.
   *
   * O cast é estritamente local ao endpoint diagnóstico.
   */
  const auditedClient = baseClient as unknown as SupabaseClient<AuditProbeDatabase>;

  /**
   * Executa somente uma leitura lógica.
   *
   * resolve_audit_actor() não altera nenhum registro.
   */
  const { data: resolvedActor, error: resolveError } =
    await auditedClient.rpc("resolve_audit_actor");

  if (resolveError) {
    console.error("Falha ao executar resolve_audit_actor durante o probe:", resolveError.message);

    return jsonResponse(
      {
        success: false,
        error: "Não foi possível executar o diagnóstico de auditoria.",
      },
      500,
    );
  }

  /**
   * UUIDs são comparados em lowercase somente para eliminar qualquer
   * diferença textual irrelevante.
   */
  const expectedActorId = actor.user.id.trim().toLowerCase();

  const resolvedActorId =
    typeof resolvedActor === "string" ? resolvedActor.trim().toLowerCase() : null;

  return jsonResponse(
    {
      success: true,
      expectedActorId,
      resolvedActorId,
      matches: resolvedActorId === expectedActorId,
      actorRole: "developer",
    },
    200,
  );
}

/**
 * Endpoint diagnóstico temporário.
 *
 * GET /api/admin/audit-probe
 *
 * Requer:
 *
 * Authorization: Bearer <JWT>
 */
export const Route = createFileRoute("/api/admin/audit-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await runAuditProbe(request);
        } catch (error: unknown) {
          console.error(
            "Erro interno no probe de auditoria:",
            error instanceof Error ? error.message : "Erro desconhecido",
          );

          return jsonResponse(
            {
              success: false,
              error: "Não foi possível executar o diagnóstico de auditoria.",
            },
            500,
          );
        }
      },
    },
  },
});
