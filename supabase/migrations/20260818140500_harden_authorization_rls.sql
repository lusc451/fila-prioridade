-- =========================================================================
-- AUTHORIZATION AND RLS HARDENING
-- =========================================================================
--
-- Goals:
--
--   1. Introduce safe authorization helpers.
--   2. Block inactive users from accessing application data.
--   3. Block users with a pending password change from operational data.
--   4. Restrict direct access to profiles and user roles.
--   5. Prevent clients from forging audit log entries.
--   6. Recognize both Admin and Developer for operational administration.
--   7. Allow only Developer to inspect all user profiles/roles.
--   8. Guarantee exactly one application role per user.
--   9. Promote the existing bootstrap Admin to Developer only when the
--      database is still in the expected single-user bootstrap state.
--
-- The whole migration runs inside a transaction.
-- =========================================================================

BEGIN;


-- =========================================================================
-- AUTHORIZATION HELPERS
-- =========================================================================
--
-- These functions use SECURITY DEFINER because they must inspect tables
-- protected by RLS without causing recursive policy evaluation.
--
-- search_path is intentionally empty. All referenced schemas/objects are
-- explicitly qualified.
-- =========================================================================


-- -------------------------------------------------------------------------
-- Is the currently authenticated user active?
-- -------------------------------------------------------------------------

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
  );
$$;


-- -------------------------------------------------------------------------
-- Can the current user access operational application data?
--
-- A temporary-password account remains authenticated by Supabase Auth, but
-- is not allowed to access patients, professionals or the queue until the
-- definitive-password flow has been completed.
-- -------------------------------------------------------------------------

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
      AND p.must_change_password = false
  );
$$;


-- -------------------------------------------------------------------------
-- Does the current user have the requested application role?
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_has_role(
  _role public.app_role
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE
      ur.user_id = (SELECT auth.uid())
      AND ur.role = _role
  );
$$;


-- -------------------------------------------------------------------------
-- Is the current user an operationally privileged account?
--
-- Both Admin and Developer preserve the existing administrative powers over
-- operational data. User-account administration will be handled separately
-- through trusted server-side operations.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_is_privileged()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE
      ur.user_id = (SELECT auth.uid())
      AND ur.role IN (
        'admin'::public.app_role,
        'developer'::public.app_role
      )
  );
$$;


-- Do not leave the default EXECUTE privilege granted to PUBLIC.

REVOKE ALL
ON FUNCTION public.current_user_is_active()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.current_user_can_use_app()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.current_user_has_role(public.app_role)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.current_user_is_privileged()
FROM PUBLIC;


-- Authenticated application sessions may invoke these helpers.

GRANT EXECUTE
ON FUNCTION public.current_user_is_active()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.current_user_can_use_app()
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.current_user_has_role(public.app_role)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.current_user_is_privileged()
TO authenticated;


-- service_role may also use them from trusted server-side code.

GRANT EXECUTE
ON FUNCTION public.current_user_is_active()
TO service_role;

GRANT EXECUTE
ON FUNCTION public.current_user_can_use_app()
TO service_role;

GRANT EXECUTE
ON FUNCTION public.current_user_has_role(public.app_role)
TO service_role;

GRANT EXECUTE
ON FUNCTION public.current_user_is_privileged()
TO service_role;


-- =========================================================================
-- HARDEN EXISTING SECURITY DEFINER FUNCTIONS
-- =========================================================================

ALTER FUNCTION public.handle_new_user()
SET search_path = '';

ALTER FUNCTION public.audit_trigger()
SET search_path = '';


-- =========================================================================
-- ONE APPLICATION ROLE PER USER
-- =========================================================================
--
-- The original UNIQUE(user_id, role) allows the same user to have multiple
-- different roles. The application model uses exactly one role per account.
--
-- The previous database audit confirmed that there are currently no users
-- with multiple roles, so this index can be introduced safely.
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_one_role_per_user
ON public.user_roles (user_id);


-- =========================================================================
-- REMOVE OLD POLICIES
-- =========================================================================

DROP POLICY IF EXISTS "perfis legiveis por autenticados"
ON public.profiles;

DROP POLICY IF EXISTS "usuario atualiza seu perfil"
ON public.profiles;

DROP POLICY IF EXISTS "usuario ve seus papeis"
ON public.user_roles;

DROP POLICY IF EXISTS "admin gerencia papeis"
ON public.user_roles;

DROP POLICY IF EXISTS "esp leitura"
ON public.especialidades;

DROP POLICY IF EXISTS "esp escrita"
ON public.especialidades;

DROP POLICY IF EXISTS "esp update"
ON public.especialidades;

DROP POLICY IF EXISTS "esp delete admin"
ON public.especialidades;

DROP POLICY IF EXISTS "pac leitura"
ON public.pacientes;

DROP POLICY IF EXISTS "pac insert"
ON public.pacientes;

DROP POLICY IF EXISTS "pac update"
ON public.pacientes;

DROP POLICY IF EXISTS "pac delete admin"
ON public.pacientes;

DROP POLICY IF EXISTS "prof leitura"
ON public.profissionais;

DROP POLICY IF EXISTS "prof insert"
ON public.profissionais;

DROP POLICY IF EXISTS "prof update"
ON public.profissionais;

DROP POLICY IF EXISTS "prof delete admin"
ON public.profissionais;

DROP POLICY IF EXISTS "fila leitura"
ON public.fila;

DROP POLICY IF EXISTS "fila insert"
ON public.fila;

DROP POLICY IF EXISTS "fila update"
ON public.fila;

DROP POLICY IF EXISTS "fila delete admin"
ON public.fila;

DROP POLICY IF EXISTS "audit admin leitura"
ON public.audit_log;

DROP POLICY IF EXISTS "audit insert"
ON public.audit_log;


-- The old helper accepted an arbitrary user UUID and is no longer required.
-- All new policies use helpers scoped to the current authenticated user.

DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);


-- =========================================================================
-- TABLE PRIVILEGES
-- =========================================================================
--
-- profiles and user_roles are managed by database triggers and trusted
-- server-side user-management operations.
--
-- The browser must not directly INSERT, UPDATE or DELETE these rows.
-- =========================================================================

-- Remove every direct table privilege previously inherited by the
-- authenticated role. We then explicitly grant back only SELECT.
--
-- This is intentionally stronger than revoking only INSERT/UPDATE/DELETE:
-- it also removes privileges such as TRUNCATE, REFERENCES and TRIGGER.

REVOKE ALL PRIVILEGES
ON public.profiles
FROM authenticated;

REVOKE ALL PRIVILEGES
ON public.user_roles
FROM authenticated;

REVOKE ALL PRIVILEGES
ON public.audit_log
FROM authenticated;


-- Explicitly restore only the read privilege required by the RLS policies.

GRANT SELECT
ON public.profiles
TO authenticated;

GRANT SELECT
ON public.user_roles
TO authenticated;

GRANT SELECT
ON public.audit_log
TO authenticated;


-- =========================================================================
-- PROFILES RLS
-- =========================================================================
--
-- Active users can read their own profile.
--
-- Developer may read all profiles so that the future user-management screen
-- can list and manage system accounts.
--
-- No direct browser UPDATE policy is created.
-- =========================================================================

CREATE POLICY "profiles_select_self_or_developer"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_is_active())
  AND (
    id = (SELECT auth.uid())
    OR
    (SELECT public.current_user_has_role(
      'developer'::public.app_role
    ))
  )
);


-- =========================================================================
-- USER ROLES RLS
-- =========================================================================
--
-- Users can see their own application role.
--
-- Developer can inspect all roles.
--
-- No authenticated INSERT/UPDATE/DELETE policy is created.
-- =========================================================================

CREATE POLICY "user_roles_select_self_or_developer"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_is_active())
  AND (
    user_id = (SELECT auth.uid())
    OR
    (SELECT public.current_user_has_role(
      'developer'::public.app_role
    ))
  )
);


-- =========================================================================
-- ESPECIALIDADES RLS
-- =========================================================================

CREATE POLICY "especialidades_select_active_user"
ON public.especialidades
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "especialidades_insert_active_user"
ON public.especialidades
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "especialidades_update_active_user"
ON public.especialidades
FOR UPDATE
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
)
WITH CHECK (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "especialidades_delete_privileged"
ON public.especialidades
FOR DELETE
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
  AND
  (SELECT public.current_user_is_privileged())
);


-- =========================================================================
-- PACIENTES RLS
-- =========================================================================

CREATE POLICY "pacientes_select_active_user"
ON public.pacientes
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "pacientes_insert_active_user"
ON public.pacientes
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "pacientes_update_active_user"
ON public.pacientes
FOR UPDATE
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
)
WITH CHECK (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "pacientes_delete_privileged"
ON public.pacientes
FOR DELETE
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
  AND
  (SELECT public.current_user_is_privileged())
);


-- =========================================================================
-- PROFISSIONAIS RLS
-- =========================================================================

CREATE POLICY "profissionais_select_active_user"
ON public.profissionais
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "profissionais_insert_active_user"
ON public.profissionais
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "profissionais_update_active_user"
ON public.profissionais
FOR UPDATE
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
)
WITH CHECK (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "profissionais_delete_privileged"
ON public.profissionais
FOR DELETE
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
  AND
  (SELECT public.current_user_is_privileged())
);


-- =========================================================================
-- FILA RLS
-- =========================================================================

CREATE POLICY "fila_select_active_user"
ON public.fila
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "fila_insert_active_user"
ON public.fila
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "fila_update_active_user"
ON public.fila
FOR UPDATE
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
)
WITH CHECK (
  (SELECT public.current_user_can_use_app())
);

CREATE POLICY "fila_delete_privileged"
ON public.fila
FOR DELETE
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
  AND
  (SELECT public.current_user_is_privileged())
);


-- =========================================================================
-- AUDIT LOG RLS
-- =========================================================================
--
-- Only an active Admin or Developer can read the audit log.
--
-- No direct authenticated INSERT policy exists.
-- =========================================================================

CREATE POLICY "audit_select_privileged"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_can_use_app())
  AND
  (SELECT public.current_user_is_privileged())
);


-- =========================================================================
-- ADD AUDITING TO SECURITY-SENSITIVE TABLES
-- =========================================================================

DROP TRIGGER IF EXISTS aud_profiles
ON public.profiles;

CREATE TRIGGER aud_profiles
AFTER INSERT OR UPDATE OR DELETE
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger();


DROP TRIGGER IF EXISTS aud_user_roles
ON public.user_roles;

CREATE TRIGGER aud_user_roles
AFTER INSERT OR UPDATE OR DELETE
ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger();


DROP TRIGGER IF EXISTS aud_especialidades
ON public.especialidades;

CREATE TRIGGER aud_especialidades
AFTER INSERT OR UPDATE OR DELETE
ON public.especialidades
FOR EACH ROW
EXECUTE FUNCTION public.audit_trigger();


-- =========================================================================
-- BOOTSTRAP THE INITIAL DEVELOPER
-- =========================================================================
--
-- The current Lovable Cloud database was audited before this migration and
-- contains exactly:
--
--   - one auth user;
--   - one profile;
--   - one role;
--   - that role is Admin;
--   - no Developer account.
--
-- Only in that exact bootstrap state is the existing Admin promoted to
-- Developer.
--
-- On an empty/future environment this block performs no promotion.
-- On a populated environment it also performs no automatic promotion.
-- =========================================================================

DO $$
DECLARE
  v_bootstrap_user_id UUID;
BEGIN
  IF
    (SELECT COUNT(*) FROM auth.users) = 1
    AND
    (SELECT COUNT(*) FROM public.profiles) = 1
    AND
    (SELECT COUNT(*) FROM public.user_roles) = 1
    AND
    NOT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE role = 'developer'::public.app_role
    )
  THEN
    SELECT ur.user_id
    INTO v_bootstrap_user_id
    FROM public.user_roles AS ur
    INNER JOIN public.profiles AS p
      ON p.id = ur.user_id
    WHERE
      ur.role = 'admin'::public.app_role
      AND p.ativo = true
    LIMIT 1;

    IF v_bootstrap_user_id IS NOT NULL THEN
      UPDATE public.user_roles
      SET role = 'developer'::public.app_role
      WHERE
        user_id = v_bootstrap_user_id
        AND role = 'admin'::public.app_role;
    END IF;
  END IF;
END
$$;


COMMIT;
