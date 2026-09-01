-- ============================================================================
-- HARDEN ACCOUNT ELIGIBILITY HELPERS
-- ============================================================================
--
-- Objetivos:
--
-- 1. uma conta arquivada nunca deve ser considerada ativa, mesmo que um estado
--    inconsistente mantenha ativo=true;
--
-- 2. uma conta somente pode acessar os dados operacionais quando:
--
--    - estiver ativa;
--    - nao estiver arquivada;
--    - tiver concluido a troca obrigatoria de senha;
--    - possuir uma role funcional;
--
-- 3. current_user_is_active() continua reconhecendo contas em primeiro acesso
--    como ativas, pois must_change_password=true nao equivale a conta inativa;
--
-- 4. os helpers nao podem ser executados pela role anon.
-- ============================================================================


-- ============================================================================
-- 1. CONTA ATIVA
-- ============================================================================
--
-- Esta funcao responde somente pela situacao administrativa basica da conta.
--
-- Uma conta em primeiro acesso continua ativa e precisa conseguir carregar o
-- proprio profile para ser encaminhada ao fluxo de troca obrigatoria de senha.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE
      p.id = (SELECT auth.uid())
      AND p.ativo = true
      AND p.deleted_at IS NULL
  );
$$;


-- ============================================================================
-- 2. CONTA AUTORIZADA A UTILIZAR A APLICACAO OPERACIONAL
-- ============================================================================
--
-- O acesso a pacientes, profissionais, especialidades e fila exige um estado
-- mais forte que simplesmente possuir uma sessao valida no Supabase Auth.
--
-- Requisitos:
--
-- - profile correspondente ao auth.uid();
-- - conta ativa;
-- - conta nao arquivada;
-- - troca obrigatoria de senha concluida;
-- - existencia de uma role funcional.
--
-- O indice UNIQUE(user_id) existente em public.user_roles impede que uma conta
-- possua mais de uma role. O EXISTS abaixo garante a outra metade do
-- invariante: para utilizar a aplicacao deve existir pelo menos uma role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_can_use_app()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE
      p.id = (SELECT auth.uid())
      AND p.ativo = true
      AND p.deleted_at IS NULL
      AND p.must_change_password = false
      AND EXISTS (
        SELECT 1
        FROM public.user_roles AS ur
        WHERE ur.user_id = p.id
      )
  );
$$;


-- ============================================================================
-- 3. PRIVILEGIOS DE EXECUCAO
-- ============================================================================
--
-- Funcoes PostgreSQL podem herdar EXECUTE de PUBLIC ou possuir grants
-- explicitos para roles individuais.
--
-- Por isso removemos explicitamente:
--
-- - PUBLIC;
-- - anon.
--
-- Somente sessoes authenticated precisam invocar estes helpers diretamente.
--
-- postgres continua com os privilegios inerentes ao owner/superuser.
-- service_role nao depende deles para as operacoes administrativas do projeto.
-- ============================================================================

REVOKE ALL
ON FUNCTION public.current_user_is_active()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.current_user_is_active()
FROM anon;

REVOKE ALL
ON FUNCTION public.current_user_can_use_app()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.current_user_can_use_app()
FROM anon;


GRANT EXECUTE
ON FUNCTION public.current_user_is_active()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.current_user_can_use_app()
TO authenticated;
