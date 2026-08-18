-- =========================================================================
-- APP ROLE: DEVELOPER
-- =========================================================================
--
-- Adiciona o perfil "developer" ao enum de pap?is da aplica??o.
--
-- Nesta migration n?o promovemos nenhum usu?rio existente.
-- O bootstrap do primeiro Developer ser? realizado separadamente,
-- ap?s a valida??o deste novo valor no banco.
-- =========================================================================

ALTER TYPE public.app_role
ADD VALUE IF NOT EXISTS 'developer';
