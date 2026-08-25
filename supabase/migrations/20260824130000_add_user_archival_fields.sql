-- ============================================================================
-- USER ARCHIVAL
-- ============================================================================
--
-- Implementa suporte estrutural para exclusão lógica de usuários.
--
-- CONTEXTO
-- ----------------------------------------------------------------------------
--
-- A exclusão física de auth.users não é adequada para esta aplicação porque:
--
--   - public.profiles possui ON DELETE CASCADE;
--   - public.user_roles possui ON DELETE CASCADE;
--   - campos históricos como criado_por/finalizado_por possuem ON DELETE
--     SET NULL.
--
-- Portanto, uma exclusão física eliminaria a identidade interna da conta e
-- removeria referências históricas importantes.
--
-- A partir desta migration, uma conta excluída administrativamente será
-- ARQUIVADA:
--
--   ativo      = false
--   deleted_at = instante da exclusão lógica
--   deleted_by = UUID do Developer responsável
--
-- Nenhum usuário é arquivado automaticamente por esta migration.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CAMPOS DE ARQUIVAMENTO
-- ============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS deleted_by UUID;

COMMENT ON COLUMN public.profiles.deleted_at IS
'Data e hora em que a conta foi arquivada administrativamente. NULL indica conta não arquivada.';

COMMENT ON COLUMN public.profiles.deleted_by IS
'UUID do Developer responsável pelo arquivamento da conta. Mantido sem FK para preservação histórica.';

-- ============================================================================
-- 2. INTEGRIDADE DO ESTADO DE ARQUIVAMENTO
-- ============================================================================
--
-- Uma conta arquivada nunca pode continuar ativa.
--
-- Contas não arquivadas continuam podendo estar:
--
--   ativo = true
--   ativo = false
--
-- permitindo que "inativo" continue sendo diferente de "excluído".
-- ============================================================================

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_archived_must_be_inactive;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_archived_must_be_inactive
CHECK (
  deleted_at IS NULL
  OR ativo = false
);

-- ============================================================================
-- 3. CONSISTÊNCIA DOS METADADOS DE ARQUIVAMENTO
-- ============================================================================
--
-- deleted_at e deleted_by devem existir juntos.
--
-- Evita estados incompletos como:
--
--   deleted_at preenchido e deleted_by NULL
--   deleted_by preenchido e deleted_at NULL
-- ============================================================================

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_archival_metadata_consistency;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_archival_metadata_consistency
CHECK (
  (
    deleted_at IS NULL
    AND deleted_by IS NULL
  )
  OR
  (
    deleted_at IS NOT NULL
    AND deleted_by IS NOT NULL
  )
);

-- ============================================================================
-- 4. REFORÇO DO GUARD DE CONTA ATIVA
-- ============================================================================
--
-- A função já verificava profiles.ativo.
--
-- Passamos também a exigir deleted_at IS NULL como defesa em profundidade.
-- Assim, mesmo diante de eventual inconsistência futura, uma conta arquivada
-- não será considerada ativa pela camada de autorização.
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
    WHERE p.id = auth.uid()
      AND p.ativo = true
      AND p.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_active() FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.current_user_is_active()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.current_user_is_active()
TO service_role;

COMMIT;