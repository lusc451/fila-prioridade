// Endpoint backend: conclui a troca obrigatória da senha temporária.
// Identidade vem EXCLUSIVAMENTE do JWT (header Authorization). Nunca do body.
import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const fail = (error: string, status: number) => json({ success: false, error }, status)

export const Route = createFileRoute('/api/complete-password-change')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const SUPABASE_URL = process.env['SUPABASE_URL']!
          const SUPABASE_PUBLISHABLE_KEY = process.env['SUPABASE_PUBLISHABLE_KEY']!
          const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']!

          // 1. Validar presença do JWT
          const authHeader = request.headers.get('Authorization') ?? ''
          if (!authHeader.toLowerCase().startsWith('bearer ')) {
            return fail('Não autenticado', 401)
          }

          // Cliente no contexto do próprio usuário (RLS aplicada como o usuário).
          const supabaseUser = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers)
                h.set('apikey', SUPABASE_PUBLISHABLE_KEY)
                h.set('Authorization', authHeader)
                return fetch(input, { ...init, headers: h })
              },
            },
            auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          })

          // 2. Identificar o usuário a partir do JWT
          const { data: userData, error: userError } = await supabaseUser.auth.getUser()
          const user = userData?.user
          if (userError || !user) return fail('Não autenticado', 401)

          // 3. Validar o profile do próprio usuário
          const { data: profile, error: profileError } = await supabaseUser
            .from('profiles')
            .select('id, ativo, must_change_password')
            .eq('id', user.id)
            .maybeSingle()

          if (profileError) {
            console.error('Falha ao carregar profile:', profileError.message)
            return fail('Falha ao carregar perfil do usuário', 500)
          }
          if (!profile) return fail('Perfil não encontrado', 404)
          if (profile.ativo !== true) return fail('Usuário inativo', 403)
          if (profile.must_change_password !== true) {
            return fail('Troca de senha obrigatória não está pendente', 403)
          }

          // 4. Validar a nova senha (nunca registrada em log)
          let body: unknown
          try {
            body = await request.json()
          } catch {
            return fail('Corpo da requisição inválido', 400)
          }
          const newPassword = (body as { newPassword?: unknown } | null)?.newPassword
          if (typeof newPassword !== 'string') return fail('newPassword deve ser uma string', 400)
          if (newPassword.length < 6) return fail('A senha deve ter no mínimo 6 caracteres', 400)
          if (!/[A-Za-zÀ-ÿ]/.test(newPassword)) {
            return fail('A senha deve conter pelo menos uma letra', 400)
          }
          if (!/[0-9]/.test(newPassword)) {
            return fail('A senha deve conter pelo menos um número', 400)
          }

          // 5. Alterar a senha no contexto autenticado do próprio usuário,
          //    mantendo as regras de segurança do Auth do projeto.
          const { error: updateError } = await supabaseUser.auth.updateUser({
            password: newPassword,
          })
          if (updateError) {
            return fail(updateError.message, updateError.status === 401 ? 401 : 400)
          }

          // 6. Só após o sucesso: must_change_password = false (credencial
          //    administrativa usada exclusivamente server-side, nunca exposta).
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          void SUPABASE_SERVICE_ROLE_KEY // exigido pelo cliente admin server-side
          const { error: flagError } = await supabaseAdmin
            .from('profiles')
            .update({ must_change_password: false })
            .eq('id', user.id)

          if (flagError) {
            console.error('Falha ao concluir troca de senha:', flagError.message)
            return fail('Senha alterada, mas falha ao concluir o processo', 500)
          }

          // 7. Sucesso
          return json({ success: true }, 200)
        } catch (e) {
          console.error('Erro interno:', e instanceof Error ? e.message : String(e))
          return fail('Erro interno', 500)
        }
      },
    },
  },
})
