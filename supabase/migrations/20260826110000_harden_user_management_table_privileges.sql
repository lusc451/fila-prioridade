-- =========================================================================
-- HARDENING DE PRIVILEGIOS - MODULO DE USUARIOS
-- =========================================================================
--
-- Objetivo:
--
-- 1. Remover privilegios diretos indevidos do papel anon sobre:
--    - profiles;
--    - user_roles;
--    - audit_log.
--
-- 2. Reafirmar que authenticated possui somente SELECT nessas tabelas.
--
-- As operacoes administrativas de escrita sao executadas exclusivamente
-- pelo backend confiavel da aplicacao.
--
-- RLS permanece habilitada e continua sendo uma camada adicional de
-- seguranca, mas nao deve substituir o principio de menor privilegio.
-- =========================================================================

BEGIN;

REVOKE ALL PRIVILEGES
ON TABLE public.profiles
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public.user_roles
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public.audit_log
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public.profiles
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.user_roles
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.audit_log
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.profiles
FROM authenticated;

REVOKE ALL PRIVILEGES
ON TABLE public.user_roles
FROM authenticated;

REVOKE ALL PRIVILEGES
ON TABLE public.audit_log
FROM authenticated;

GRANT SELECT
ON TABLE public.profiles
TO authenticated;

GRANT SELECT
ON TABLE public.user_roles
TO authenticated;

GRANT SELECT
ON TABLE public.audit_log
TO authenticated;

COMMIT;
