-- =========================================================================
-- AUTORIA CONFIAVEL PARA AUDIT LOG
-- =========================================================================
--
-- Problema:
--
-- As operacoes administrativas da aplicacao utilizam service_role.
-- Nesse contexto, auth.uid() nao representa o Developer/Admin que
-- originou a requisicao e os registros de audit_log ficam com autor NULL.
--
-- Estrategia:
--
-- 1. Operacoes normais autenticadas:
--      auth.uid()
--
-- 2. Operacoes administrativas via PostgREST/service_role:
--      header interno x-audit-actor-id
--
--    Esse header somente sera aceito quando o JWT corrente possuir
--    role = service_role.
--
-- 3. Criacao de usuario pelo Supabase Auth:
--      app_metadata.created_by
--
--    handle_new_user() valida o UUID e, somente quando ele pertence
--    a um Admin/Developer ativo e apto, grava esse identificador em
--    um contexto transacional privado:
--
--      app.audit_actor_id
--
-- O navegador nunca sera autoridade para definir o ator.
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. RESOLVER O AUTOR DA OPERACAO
-- =========================================================================

CREATE OR REPLACE FUNCTION public.resolve_audit_actor()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor UUID;

  v_context_actor_text TEXT;

  v_headers_text TEXT;
  v_headers JSONB;
  v_header_actor_text TEXT;
    BEGIN
    v_actor := v_header_actor_text::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;

  -- -----------------------------------------------------------------------
  -- 1.4. Defesa em profundidade para o ator administrativo.
  --
  -- O backend já autentica e autoriza o usuário antes de configurar
  -- x-audit-actor-id. Mesmo assim, não confiamos apenas nessa camada.
  --
  -- Para ser aceito como autor administrativo, o UUID precisa:
  --
  -- - possuir profile;
  -- - estar ativo;
  -- - não estar arquivado;
  -- - ter concluído eventual troca obrigatória de senha;
  -- - possuir role Developer ou Admin.
  --
  -- Dessa forma, mesmo uma chamada interna executada com service_role
  -- não consegue atribuir autoria a um usuário arbitrário/inativo.
  -- -----------------------------------------------------------------------

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
END;
$function$;

-- A funcao e infraestrutura interna do banco.
-- Nao deve funcionar como RPC publica da aplicacao.

REVOKE ALL
ON FUNCTION public.resolve_audit_actor()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.resolve_audit_actor()
FROM anon;

REVOKE ALL
ON FUNCTION public.resolve_audit_actor()
FROM authenticated;

-- service_role pode utiliza-la para diagnostico/infraestrutura server-side.

GRANT EXECUTE
ON FUNCTION public.resolve_audit_actor()
TO service_role;

-- =========================================================================
-- 2. ATUALIZAR O TRIGGER GENERICO DE AUDITORIA
-- =========================================================================
--
-- Preservamos o comportamento atual:
--
-- DELETE:
--   entidade_id e payload sao obtidos de OLD.
--
-- INSERT / UPDATE:
--   entidade_id e payload sao obtidos de NEW.
--
-- A unica mudanca funcional e a resolucao confiavel de autor.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id UUID;
  v_payload JSONB;
  v_actor UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    v_payload := to_jsonb(OLD);
  ELSE
    v_id := NEW.id;
    v_payload := to_jsonb(NEW);
  END IF;

  v_actor := public.resolve_audit_actor();

  INSERT INTO public.audit_log (
    entidade,
    entidade_id,
    acao,
    autor,
    payload
  )
  VALUES (
    TG_TABLE_NAME,
    v_id,
    TG_OP,
    v_actor,
    v_payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE ALL
ON FUNCTION public.audit_trigger()
FROM PUBLIC;

-- =========================================================================
-- 3. ATUALIZAR handle_new_user()
-- =========================================================================
--
-- created_by vira uma informacao administrativa.
--
-- Posteriormente, o endpoint server-side de criacao enviara:
--
-- app_metadata: {
--   created_by: actor.user.id
-- }
--
-- Como app_metadata e gravado pelo fluxo administrativo server-side,
-- ele nao sera tratado como entrada comum do usuario.
--
-- Mesmo assim, o banco realiza defesas adicionais:
--
-- - precisa ser UUID valido;
-- - precisa possuir profile;
-- - profile precisa estar ativo;
-- - nao pode estar arquivado;
-- - troca obrigatoria de senha precisa estar concluida;
-- - precisa possuir role Admin ou Developer.
--
-- Se qualquer verificacao falhar, o cadastro continua normalmente,
-- mas os INSERTs automaticos permanecem sem autor em vez de aceitar
-- uma identidade duvidosa.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_username TEXT;
  v_cargo public.cargo_usuario;

  v_created_by_text TEXT;
  v_created_by UUID;
  v_created_by_is_trusted BOOLEAN := false;
BEGIN
  -- -----------------------------------------------------------------------
  -- 3.1. Username
  -- -----------------------------------------------------------------------

  v_username :=
    NULLIF(
      lower(
        btrim(
          COALESCE(
            NEW.raw_user_meta_data ->> 'username',
            ''
          )
        )
      ),
      ''
    );

  -- Username invalido e ignorado para impedir que metadados malformados
  -- criem um profile inconsistente.

  IF v_username IS NOT NULL
     AND (
       char_length(v_username) < 3
       OR char_length(v_username) > 32
       OR v_username !~ '^[a-z0-9][a-z0-9._-]*$'
     )
  THEN
    v_username := NULL;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3.2. Cargo
  -- -----------------------------------------------------------------------

  v_cargo :=
    CASE NEW.raw_user_meta_data ->> 'cargo'
      WHEN 'enfermeiro'
        THEN 'enfermeiro'::public.cargo_usuario

      WHEN 'tecnico_enfermagem'
        THEN 'tecnico_enfermagem'::public.cargo_usuario

      WHEN 'recepcao'
        THEN 'recepcao'::public.cargo_usuario

      ELSE NULL
    END;

  -- -----------------------------------------------------------------------
  -- 3.3. Possivel ator administrativo da criacao
  -- -----------------------------------------------------------------------

  v_created_by_text :=
    NULLIF(
      btrim(
        COALESCE(
          NEW.raw_app_meta_data ->> 'created_by',
          ''
        )
      ),
      ''
    );

  IF v_created_by_text IS NOT NULL THEN
    BEGIN
      v_created_by := v_created_by_text::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_created_by := NULL;
    END;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3.4. Validar se created_by realmente representa um ator administrativo
  --      apto no momento da criacao.
  -- -----------------------------------------------------------------------

  IF v_created_by IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles AS p
      JOIN public.user_roles AS ur
        ON ur.user_id = p.id
      WHERE p.id = v_created_by
        AND p.ativo = true
        AND p.deleted_at IS NULL
        AND p.must_change_password = false
        AND ur.role IN (
          'developer'::public.app_role,
          'admin'::public.app_role
        )
    )
    INTO v_created_by_is_trusted;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3.5. Estabelecer contexto transacional de auditoria.
  --
  -- O terceiro argumento true torna a configuracao LOCAL a transacao.
  -- Portanto, ela nao vaza para operacoes posteriores da conexao.
  -- -----------------------------------------------------------------------

  IF v_created_by_is_trusted THEN
    PERFORM pg_catalog.set_config(
      'app.audit_actor_id',
      v_created_by::TEXT,
      true
    );
  END IF;

  -- -----------------------------------------------------------------------
  -- 3.6. Criar profile
  -- -----------------------------------------------------------------------

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
      NULLIF(
        btrim(
          NEW.raw_user_meta_data ->> 'nome_completo'
        ),
        ''
      ),
      NEW.email,
      'Usuario'
    ),

    v_username,

    v_cargo,

    true
  );

  -- -----------------------------------------------------------------------
  -- 3.7. Role inicial sempre de menor privilegio.
  --
  -- Qualquer promocao posterior para Admin ou Developer continua sendo
  -- responsabilidade exclusiva do fluxo administrativo server-side.
  -- -----------------------------------------------------------------------

  INSERT INTO public.user_roles (
    user_id,
    role
  )
  VALUES (
    NEW.id,
    'usuario'
  )
  ON CONFLICT (user_id, role)
  DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL
ON FUNCTION public.handle_new_user()
FROM PUBLIC;

COMMIT;