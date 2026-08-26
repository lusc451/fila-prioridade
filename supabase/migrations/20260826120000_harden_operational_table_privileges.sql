-- =========================================================================
-- HARDENING DE PRIVILEGIOS DAS TABELAS OPERACIONAIS
-- =========================================================================
--
-- Contexto:
--
-- A auditoria de seguranca identificou que os papeis anon e authenticated
-- possuíam privilegios excessivos sobre as tabelas operacionais:
--
-- - DELETE
-- - INSERT
-- - REFERENCES
-- - SELECT
-- - TRIGGER
-- - TRUNCATE
-- - UPDATE
--
-- Embora as policies RLS restrinjam as operacoes de linha, privilegios
-- como TRUNCATE nao sao controlados por RLS.
--
-- Estrategia:
--
-- anon:
--   nenhum privilegio direto.
--
-- authenticated:
--   somente os privilegios DML necessarios para a aplicacao:
--
--   - SELECT
--   - INSERT
--   - UPDATE
--   - DELETE
--
-- A autorizacao fina continua sendo aplicada pelas policies RLS.
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. REMOVER PRIVILEGIOS CONCEDIDOS VIA PUBLIC
-- =========================================================================

REVOKE ALL PRIVILEGES
ON TABLE public.especialidades
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public.fila
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public.pacientes
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE public.profissionais
FROM PUBLIC;

-- =========================================================================
-- 2. REMOVER COMPLETAMENTE O ACESSO DIRETO DE anon
-- =========================================================================
--
-- O sistema e de acesso interno e exige autenticacao.
-- Portanto, anon nao necessita acesso direto a essas tabelas.
-- =========================================================================

REVOKE ALL PRIVILEGES
ON TABLE public.especialidades
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.fila
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.pacientes
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.profissionais
FROM anon;

-- =========================================================================
-- 3. RECONSTRUIR OS PRIVILEGIOS DE authenticated
-- =========================================================================
--
-- Primeiro removemos tudo para obter um estado deterministico.
--
-- Depois concedemos somente:
--
-- - SELECT
-- - INSERT
-- - UPDATE
-- - DELETE
--
-- REFERENCES, TRIGGER e TRUNCATE nao sao necessarios para o funcionamento
-- normal da aplicacao.
-- =========================================================================

REVOKE ALL PRIVILEGES
ON TABLE public.especialidades
FROM authenticated;

REVOKE ALL PRIVILEGES
ON TABLE public.fila
FROM authenticated;

REVOKE ALL PRIVILEGES
ON TABLE public.pacientes
FROM authenticated;

REVOKE ALL PRIVILEGES
ON TABLE public.profissionais
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.especialidades
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.fila
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.pacientes
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.profissionais
TO authenticated;

COMMIT;