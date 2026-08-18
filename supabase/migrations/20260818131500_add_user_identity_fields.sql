-- =========================================================================
-- USER IDENTITY
-- =========================================================================
--
-- Adds the fields required by the internal user-management model.
--
-- This migration intentionally does NOT:
--   - promote any account to developer;
--   - change RLS policies;
--   - change operational permissions.
--
-- Those changes are handled in the authorization migration.
-- =========================================================================


-- =========================================================================
-- CARGO ENUM
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS t
    JOIN pg_namespace AS n
      ON n.oid = t.typnamespace
    WHERE
      n.nspname = 'public'
      AND t.typname = 'cargo_usuario'
  ) THEN
    CREATE TYPE public.cargo_usuario AS ENUM (
      'enfermeiro',
      'tecnico_enfermagem',
      'recepcao'
    );
  END IF;
END
$$;


-- =========================================================================
-- PROFILE FIELDS
-- =========================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cargo public.cargo_usuario;


-- Existing accounts keep their current password.
--
-- By creating the column with DEFAULT false first, profiles that already
-- exist are considered migrated accounts and are not forced through the
-- temporary-password flow.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;


-- New profiles must use the temporary-password flow by default.
ALTER TABLE public.profiles
ALTER COLUMN must_change_password SET DEFAULT true;


-- =========================================================================
-- USERNAME NORMALIZATION
-- =========================================================================
--
-- Usernames are stored in lowercase.
--
-- Existing NULL values are preserved. This is necessary because the
-- Developer account already existed before username support was introduced.
-- =========================================================================

UPDATE public.profiles
SET username = NULLIF(lower(btrim(username)), '')
WHERE username IS NOT NULL;


-- Username rules:
--
--   - 3 to 32 characters;
--   - lowercase;
--   - letters a-z;
--   - digits 0-9;
--   - ".", "_" and "-" are permitted;
--   - first character must be alphanumeric.
--
-- NULL remains valid for legacy/system accounts during the migration phase.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE
      conname = 'profiles_username_format_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_username_format_check
    CHECK (
      username IS NULL
      OR (
        username = lower(username)
        AND char_length(username) BETWEEN 3 AND 32
        AND username ~ '^[a-z0-9][a-z0-9._-]*$'
      )
    );
  END IF;
END
$$;


-- Case-insensitive uniqueness.
--
-- Even though the CHECK constraint requires lowercase usernames, using
-- lower(username) here protects the uniqueness rule at database level.

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower_unique
ON public.profiles (lower(username))
WHERE username IS NOT NULL;


-- =========================================================================
-- NEW USER TRIGGER
-- =========================================================================
--
-- Every account created through Auth starts as "usuario".
--
-- Privileged roles must NEVER be inferred from:
--   - user count;
--   - email;
--   - client-supplied metadata.
--
-- Admin/Developer roles will later be assigned exclusively through trusted
-- server-side operations.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_cargo public.cargo_usuario;
BEGIN
  -- Username may be supplied by a trusted creation workflow later.
  v_username :=
    NULLIF(
      lower(
        btrim(
          COALESCE(NEW.raw_user_meta_data->>'username', '')
        )
      ),
      ''
    );

  -- Invalid client-provided usernames are ignored rather than allowing
  -- malformed profile data into the database.
  IF v_username IS NOT NULL AND (
    char_length(v_username) < 3
    OR char_length(v_username) > 32
    OR v_username !~ '^[a-z0-9][a-z0-9._-]*$'
  ) THEN
    v_username := NULL;
  END IF;

  -- Cargo is mapped explicitly. Arbitrary metadata cannot be cast directly
  -- to the enum.
  v_cargo :=
    CASE NEW.raw_user_meta_data->>'cargo'
      WHEN 'enfermeiro'
        THEN 'enfermeiro'::public.cargo_usuario
      WHEN 'tecnico_enfermagem'
        THEN 'tecnico_enfermagem'::public.cargo_usuario
      WHEN 'recepcao'
        THEN 'recepcao'::public.cargo_usuario
      ELSE NULL
    END;

  INSERT INTO public.profiles (
    id,
    nome_completo,
    username,
    cargo,
    must_change_password
  )
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(btrim(NEW.raw_user_meta_data->>'nome_completo'), ''),
      NEW.email,
      'Usuario'
    ),
    v_username,
    v_cargo,
    true
  );

  -- The database trigger always assigns the lowest application role.
  --
  -- Promotion to Admin or Developer must happen through a trusted
  -- server-side administrative workflow.
  INSERT INTO public.user_roles (
    user_id,
    role
  )
  VALUES (
    NEW.id,
    'usuario'
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
