BEGIN;

-- =========================================================================
-- AUDITORIA DE OPERACOES SELF-SERVICE VIA SERVICE ROLE
-- =========================================================================
--
-- Contextos existentes:
--
-- 1. auth.uid()
--    Chamadas PostgreSQL realizadas diretamente sob uma sessao autenticada.
--
-- 2. app.audit_actor_id
--    Contexto transacional confiavel estabelecido pelo proprio banco.
--
-- 3. x-audit-actor-id
--    Contexto administrativo transportado por requisicoes service_role.
--    Continua restrito a Developer/Admin aptos.
--
-- Novo contexto:
--
-- 4. x-audit-self-user-id
--    Identidade de um usuario que executa uma operacao estritamente
--    self-service atraves de um endpoint server-side confiavel.
--
-- O navegador nunca possui service_role e, portanto, nao pode utilizar
-- diretamente esse header para falsificar a autoria.
--
-- O primeiro consumidor sera a conclusao da troca obrigatoria de senha.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.resolve_audit_actor()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor UUID;

  v_context_actor_text TEXT;

  v_headers_text TEXT;
  v_headers JSONB;

  v_admin_actor_text TEXT;
  v_self_actor_text TEXT;
BEGIN
  -- =======================================================================
  -- 1. USUARIO AUTENTICADO REAL
  -- =======================================================================
  --
  -- Quando a operacao chega ao PostgreSQL utilizando o JWT real do usuario,
  -- auth.uid() e sempre a fonte de autoria preferencial.
  -- =======================================================================

  v_actor := auth.uid();

  IF v_actor IS NOT NULL THEN
    RETURN v_actor;
  END IF;

  -- =======================================================================
  -- 2. CONTEXTO TRANSACIONAL CONFIAVEL
  -- =======================================================================

  v_context_actor_text :=
    NULLIF(
      pg_catalog.current_setting(
        'app.audit_actor_id',
        true
      ),
      ''
    );

  IF v_context_actor_text IS NOT NULL THEN
    BEGIN
      v_actor := v_context_actor_text::UUID;

      RETURN v_actor;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_actor := NULL;
    END;
  END IF;

  -- =======================================================================
  -- 3. HEADERS CONTEXTUAIS SOMENTE PARA SERVICE ROLE
  -- =======================================================================
  --
  -- Nenhum header abaixo possui valor de confianca quando enviado por uma
  -- chamada authenticated/anon.
  --
  -- Essa verificacao impede que um navegador tente fabricar a identidade
  -- registrada no audit_log.
  -- =======================================================================

  IF auth.role() <> 'service_role' THEN
    RETURN NULL;
  END IF;

  v_headers_text :=
    NULLIF(
      pg_catalog.current_setting(
        'request.headers',
        true
      ),
      ''
    );

  IF v_headers_text IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_headers := v_headers_text::JSONB;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;

  -- =======================================================================
  -- 4. CONTEXTO ADMINISTRATIVO
  -- =======================================================================
  --
  -- Mantemos integralmente a regra anterior:
  --
  -- - profile ativo;
  -- - nao arquivado;
  -- - troca obrigatoria concluida;
  -- - role Developer ou Admin.
  -- =======================================================================

  v_admin_actor_text :=
    NULLIF(
      btrim(
        COALESCE(
          v_headers ->> 'x-audit-actor-id',
          ''
        )
      ),
      ''
    );

  IF v_admin_actor_text IS NOT NULL THEN
    BEGIN
      v_actor := v_admin_actor_text::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN NULL;
    END;

    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      JOIN public.user_roles AS ur
        ON ur.user_id = p.id
      WHERE p.id = v_actor
        AND p.ativo = true
        AND p.deleted_at IS NULL
        AND p.must_change_password = false
        AND ur.role IN (
          'developer'::public.app_role,
          'admin'::public.app_role
        )
    ) THEN
      RETURN NULL;
    END IF;

    RETURN v_actor;
  END IF;

  -- =======================================================================
  -- 5. CONTEXTO SELF-SERVICE
  -- =======================================================================
  --
  -- Este header existe para operacoes server-side nas quais:
  --
  -- - o endpoint validou previamente o JWT do usuario;
  -- - o UUID veio exclusivamente desse JWT;
  -- - a operacao posterior e executada com service_role;
  -- - a operacao representa uma acao do proprio usuario.
  --
  -- Aqui validamos somente que a identidade ainda corresponde a uma conta
  -- utilizavel. Nao exigimos must_change_password=true porque o trigger e
  -- executado DEPOIS do UPDATE que muda essa flag para false.
  --
  -- A garantia de que o alvo e o proprio usuario permanecera no endpoint:
  --
  --   .eq("id", user.id)
  --
  -- onde user.id foi obtido por auth.getUser(accessToken).
  -- =======================================================================

  v_self_actor_text :=
    NULLIF(
      btrim(
        COALESCE(
          v_headers ->> 'x-audit-self-user-id',
          ''
        )
      ),
      ''
    );

  IF v_self_actor_text IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_actor := v_self_actor_text::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = v_actor
      AND p.ativo = true
      AND p.deleted_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v_actor;
END;
$function$;

-- =========================================================================
-- PRIVILEGIOS
-- =========================================================================
--
-- resolve_audit_actor() e infraestrutura interna do banco.
-- O trigger executa a funcao sob SECURITY DEFINER.
-- =========================================================================

REVOKE ALL
ON FUNCTION public.resolve_audit_actor()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.resolve_audit_actor()
FROM anon;

REVOKE ALL
ON FUNCTION public.resolve_audit_actor()
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.resolve_audit_actor()
TO service_role;

COMMIT;
