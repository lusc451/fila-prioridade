/**
 * Cliente Supabase administrativo com contexto confiável de auditoria.
 *
 * IMPORTANTE:
 *
 * Este arquivo é exclusivamente server-side.
 *
 * Ele cria uma NOVA instância do cliente Supabase para cada operação
 * administrativa que precisa registrar autoria no audit_log.
 *
 * Não utilizamos o singleton `supabaseAdmin` para isso porque alterar
 * headers compartilhados em uma instância global poderia misturar
 * identidades entre requisições concorrentes.
 *
 * Fluxo esperado:
 *
 *   navegador
 *      ↓
 *   JWT do usuário
 *      ↓
 *   authenticateManagementActor()
 *      ↓
 *   actor.user.id validado
 *      ↓
 *   createAuditedSupabaseAdminClient(actor.user.id)
 *      ↓
 *   x-audit-actor-id
 *      ↓
 *   PostgREST / PostgreSQL
 *      ↓
 *   resolve_audit_actor()
 *      ↓
 *   audit_log.autor
 *
 * O banco realiza uma segunda validação do UUID recebido:
 *
 * - profile existente;
 * - ativo;
 * - não arquivado;
 * - sem troca obrigatória de senha;
 * - role Developer ou Admin.
 *
 * Portanto, o header representa somente transporte de contexto.
 * A decisão final de confiança permanece protegida pelo banco.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Nome do header interno reconhecido pela infraestrutura de auditoria
 * instalada no PostgreSQL.
 *
 * Nunca deve ser preenchido a partir de dados arbitrários enviados
 * pelo navegador.
 */
const AUDIT_ACTOR_HEADER = "x-audit-actor-id";

/**
 * UUID PostgreSQL em representação textual canônica.
 *
 * Não restringimos uma versão específica do UUID para evitar acoplamento
 * desnecessário a UUIDv4.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lovable/Supabase pode utilizar as novas API keys opacas:
 *
 * - sb_publishable_...
 * - sb_secret_...
 *
 * Diferentemente dos JWTs legados, essas chaves não devem ser tratadas
 * como Bearer tokens.
 *
 * Esta mesma compatibilidade já existe no client.server.ts gerado.
 * Ela é reproduzida aqui deliberadamente para que este arquivo manual
 * não precise modificar/importar internals do arquivo gerado.
 */
function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * Valida e normaliza o UUID do ator antes de utilizá-lo em um header.
 *
 * Essa validação é apenas defesa local/fail-fast.
 *
 * A validação de autorização real acontece:
 *
 * 1. previamente em authenticateManagementActor();
 * 2. novamente em public.resolve_audit_actor() no PostgreSQL.
 */
function normalizeAuditActorId(actorId: string): string {
  const normalized = actorId.trim().toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error("Invalid audit actor id.");
  }

  return normalized;
}

/**
 * Carrega exclusivamente as credenciais administrativas server-side.
 *
 * SUPABASE_SERVICE_ROLE_KEY nunca pode possuir prefixo VITE_ e nunca
 * pode ser disponibilizada ao navegador.
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
 * Fetch exclusivo do cliente administrativo auditado.
 *
 * Responsabilidades:
 *
 * - preservar headers já criados pelo Supabase;
 * - aplicar headers específicos da chamada;
 * - manter compatibilidade com novas API keys opacas;
 * - garantir presença do apikey;
 * - adicionar x-audit-actor-id.
 *
 * Cada cliente recebe um actorId imutável durante toda sua vida útil.
 */
function createAuditedSupabaseFetch(supabaseKey: string, actorId: string): typeof fetch {
  return (input, init) => {
    /**
     * Preserva headers eventualmente presentes no Request original.
     */
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    /**
     * Headers informados diretamente pela chamada possuem precedência
     * sobre os existentes no Request.
     */
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers.set(key, value);
      });
    }

    /**
     * Novas Supabase API keys são valores opacos, não JWTs.
     *
     * Mantemos a mesma proteção presente no client.server.ts gerado:
     * se a biblioteca tentar utilizar a própria sb_secret_* como Bearer,
     * removemos somente esse Authorization específico.
     *
     * Um Authorization legítimo diferente não é removido.
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
     * Contexto de auditoria.
     *
     * O valor já chegou normalizado ao factory e não pode ser alterado
     * externamente durante a vida útil deste cliente.
     */
    headers.set(AUDIT_ACTOR_HEADER, actorId);

    return fetch(input, {
      ...init,
      headers,
    });
  };
}

/**
 * Cria um cliente service-role exclusivo de uma operação administrativa
 * auditada.
 *
 * NÃO existe singleton propositalmente.
 *
 * Exemplo futuro:
 *
 * const auditedAdmin =
 *   createAuditedSupabaseAdminClient(actor.user.id);
 *
 * await auditedAdmin
 *   .from("profiles")
 *   .update(...)
 *   .eq("id", targetUserId);
 *
 * O cliente deve ser utilizado apenas depois que
 * authenticateManagementActor() tiver validado o ator.
 *
 * Para operações da API de Auth, como:
 *
 * - auth.admin.createUser();
 * - auth.admin.updateUserById();
 *
 * continuaremos utilizando o supabaseAdmin normal.
 *
 * A autoria das mudanças em profiles/user_roles é o objetivo deste
 * cliente contextualizado.
 */
export function createAuditedSupabaseAdminClient(actorId: string): SupabaseClient<Database> {
  const normalizedActorId = normalizeAuditActorId(actorId);

  const { supabaseUrl, serviceRoleKey } = readSupabaseAdminEnvironment();

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    global: {
      fetch: createAuditedSupabaseFetch(serviceRoleKey, normalizedActorId),
    },

    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
