/**
 * Cliente Supabase administrativo com contexto de auditoria
 * para operacoes self-service.
 *
 * IMPORTANTE:
 *
 * Este arquivo e exclusivamente server-side.
 *
 * Ele NAO representa um Developer ou Administrador.
 *
 * Seu objetivo e transportar ao PostgreSQL a identidade de um usuario
 * autenticado que esta executando uma operacao estritamente sobre a
 * propria conta atraves de um endpoint server-side confiavel.
 *
 * Primeiro uso previsto:
 *
 * - conclusao da troca obrigatoria de senha;
 * - profiles.must_change_password: true -> false.
 *
 * Fluxo:
 *
 * navegador
 *    |
 *    | JWT real do usuario
 *    v
 * endpoint server-side
 *    |
 *    | auth.getUser(accessToken)
 *    v
 * user.id validado
 *    |
 *    v
 * createSelfServiceAuditedSupabaseAdminClient(user.id)
 *    |
 *    | service role
 *    | x-audit-self-user-id
 *    v
 * PostgREST / PostgreSQL
 *    |
 *    v
 * resolve_audit_actor()
 *    |
 *    v
 * audit_log.autor = proprio usuario
 *
 * A credencial service_role nunca e exposta ao navegador.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Header interno reconhecido por public.resolve_audit_actor().
 *
 * Este nome deve permanecer sincronizado com a migration:
 *
 * 20260828103000_add_self_service_audit_context.sql
 */
const SELF_SERVICE_AUDIT_HEADER = "x-audit-self-user-id";

/**
 * UUID PostgreSQL em representacao textual canonica.
 *
 * Nao restringimos uma versao especifica do UUID.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lovable/Supabase pode utilizar API keys opacas:
 *
 * - sb_publishable_...
 * - sb_secret_...
 *
 * Essas chaves nao devem ser tratadas como JWT Bearer.
 *
 * Mantemos aqui a mesma compatibilidade utilizada pelos outros
 * clientes server-side do projeto.
 */
function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * Valida e normaliza o UUID do usuario.
 *
 * Essa verificacao e apenas defesa local e fail-fast.
 *
 * O UUID fornecido a este factory deve sempre ter sido obtido
 * anteriormente de uma identidade autenticada validada pelo endpoint.
 */
function normalizeSelfServiceUserId(userId: string): string {
  const normalized = userId.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("Invalid self-service audit user id.");
  }

  return normalized;
}

/**
 * Carrega as credenciais administrativas exclusivamente
 * do ambiente server-side.
 *
 * SUPABASE_SERVICE_ROLE_KEY:
 *
 * - nunca deve possuir prefixo VITE_;
 * - nunca deve ser retornada em responses;
 * - nunca deve ser enviada ao navegador;
 * - nunca deve ser registrada em logs.
 */
function readSupabaseAdminEnvironment(): {
  supabaseUrl: string;
  serviceRoleKey: string;
} {
  const supabaseUrl = process.env.SUPABASE_URL;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [
      ...(!supabaseUrl ? ["SUPABASE_URL"] : []),

      ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ];

    const message =
      `Missing Supabase environment variable(s): ${missing.join(", ")}. ` +
      "Connect Supabase in Lovable Cloud.";

    console.error(`[Supabase] ${message}`);

    throw new Error(message);
  }

  return {
    supabaseUrl,
    serviceRoleKey,
  };
}

/**
 * Cria o fetch exclusivo de uma operacao self-service auditada.
 *
 * Responsabilidades:
 *
 * - preservar headers existentes;
 * - preservar headers especificos da chamada;
 * - garantir o apikey administrativo;
 * - manter compatibilidade com API keys opacas;
 * - adicionar x-audit-self-user-id.
 *
 * O userId e imutavel durante toda a vida do cliente.
 */
function createSelfServiceAuditedSupabaseFetch(supabaseKey: string, userId: string): typeof fetch {
  return (input, init) => {
    /**
     * Preserva headers eventualmente existentes no Request.
     */
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    /**
     * Headers fornecidos diretamente pela chamada possuem
     * precedencia sobre os existentes no Request.
     */
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    /**
     * API keys opacas nao sao JWTs.
     *
     * Caso a biblioteca tente utilizar a propria sb_secret_*
     * como Authorization Bearer, removemos somente esse valor.
     */
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    /**
     * Credencial administrativa.
     */
    headers.set("apikey", supabaseKey);

    /**
     * Contexto self-service confiavel.
     *
     * O valor vem do user.id previamente validado pelo endpoint.
     *
     * Nao existe leitura de body, query string, cookie arbitrario
     * ou header enviado pelo navegador para determinar este UUID.
     */
    headers.set(SELF_SERVICE_AUDIT_HEADER, userId);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

/**
 * Cria um cliente service-role exclusivo para uma operacao
 * self-service auditada.
 *
 * Nao existe singleton propositalmente.
 *
 * Cada request deve possuir sua propria instancia para impedir
 * contaminacao de contexto entre usuarios concorrentes.
 *
 * Exemplo de uso futuro:
 *
 * const selfServiceAdmin =
 *   createSelfServiceAuditedSupabaseAdminClient(
 *     user.id,
 *   );
 *
 * await selfServiceAdmin
 *   .from("profiles")
 *   .update({
 *     must_change_password: false,
 *   })
 *   .eq(
 *     "id",
 *     user.id,
 *   );
 *
 * RESTRICAO DE SEGURANCA:
 *
 * Este cliente deve ser criado somente DEPOIS que o endpoint
 * tiver obtido user.id atraves da validacao do JWT.
 *
 * Ele nao deve receber um targetUserId arbitrario proveniente
 * do navegador.
 */
export function createSelfServiceAuditedSupabaseAdminClient(
  userId: string,
): SupabaseClient<Database> {
  const normalizedUserId = normalizeSelfServiceUserId(userId);

  const { supabaseUrl, serviceRoleKey } = readSupabaseAdminEnvironment();

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    global: {
      fetch: createSelfServiceAuditedSupabaseFetch(serviceRoleKey, normalizedUserId),
    },

    auth: {
      storage: undefined,

      persistSession: false,

      autoRefreshToken: false,
    },
  });
}
