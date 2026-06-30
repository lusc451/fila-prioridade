
-- =========================================================================
-- ENUMS
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'usuario');
CREATE TYPE public.prioridade_atendimento AS ENUM ('urgencia','prioridade_exame','prioridade_retorno','rotina_retorno');
CREATE TYPE public.tipo_atendimento AS ENUM ('primeira','retorno');
CREATE TYPE public.status_atendimento AS ENUM ('aguardando','concluido','cancelado');

-- =========================================================================
-- UTIL: updated_at trigger
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================================================================
-- PROFILES
-- =========================================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perfis legiveis por autenticados" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "usuario atualiza seu perfil" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- USER ROLES
-- =========================================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "usuario ve seus papeis" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin gerencia papeis" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- HANDLE NEW USER: cria profile + primeiro usuário vira admin
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.profiles (id, nome_completo)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome_completo', NEW.email));

  SELECT COUNT(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'usuario');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- ESPECIALIDADES
-- =========================================================================
CREATE TABLE public.especialidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.especialidades TO authenticated;
GRANT ALL ON public.especialidades TO service_role;
ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "esp leitura" ON public.especialidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "esp escrita" ON public.especialidades FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "esp update" ON public.especialidades FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "esp delete admin" ON public.especialidades FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_esp_upd BEFORE UPDATE ON public.especialidades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- PACIENTES
-- =========================================================================
CREATE TABLE public.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  data_nascimento DATE NOT NULL,
  telefone TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pacientes_nome ON public.pacientes (lower(nome));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO authenticated;
GRANT ALL ON public.pacientes TO service_role;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pac leitura" ON public.pacientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "pac insert" ON public.pacientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pac update" ON public.pacientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pac delete admin" ON public.pacientes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_pac_upd BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- PROFISSIONAIS
-- =========================================================================
CREATE TABLE public.profissionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  especialidade_id UUID NOT NULL REFERENCES public.especialidades(id) ON DELETE RESTRICT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prof_especialidade ON public.profissionais (especialidade_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profissionais TO authenticated;
GRANT ALL ON public.profissionais TO service_role;
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prof leitura" ON public.profissionais FOR SELECT TO authenticated USING (true);
CREATE POLICY "prof insert" ON public.profissionais FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prof update" ON public.profissionais FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "prof delete admin" ON public.profissionais FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_prof_upd BEFORE UPDATE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- FILA
-- =========================================================================
CREATE TABLE public.fila (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE RESTRICT,
  profissional_id UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE RESTRICT,
  prioridade public.prioridade_atendimento NOT NULL,
  tipo public.tipo_atendimento NOT NULL,
  data_ultima_consulta DATE,
  observacoes TEXT,
  status public.status_atendimento NOT NULL DEFAULT 'aguardando',
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  finalizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  finalizado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fila_status_prio ON public.fila (status, prioridade, created_at);
CREATE INDEX idx_fila_prof ON public.fila (profissional_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fila TO authenticated;
GRANT ALL ON public.fila TO service_role;
ALTER TABLE public.fila ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fila leitura" ON public.fila FOR SELECT TO authenticated USING (true);
CREATE POLICY "fila insert" ON public.fila FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fila update" ON public.fila FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "fila delete admin" ON public.fila FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_fila_upd BEFORE UPDATE ON public.fila FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger valida data_ultima_consulta
CREATE OR REPLACE FUNCTION public.fila_validate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tipo = 'retorno' AND NEW.data_ultima_consulta IS NULL THEN
    RAISE EXCEPTION 'data_ultima_consulta é obrigatória para retorno';
  END IF;
  IF NEW.data_ultima_consulta IS NOT NULL AND NEW.data_ultima_consulta > CURRENT_DATE THEN
    RAISE EXCEPTION 'data_ultima_consulta não pode ser futura';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_fila_validate BEFORE INSERT OR UPDATE ON public.fila FOR EACH ROW EXECUTE FUNCTION public.fila_validate();

-- =========================================================================
-- AUDIT LOG
-- =========================================================================
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade TEXT NOT NULL,
  entidade_id UUID,
  acao TEXT NOT NULL,
  autor UUID,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON public.audit_log (created_at DESC);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit admin leitura" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audit insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_payload JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id; v_payload := to_jsonb(OLD);
  ELSE
    v_id := NEW.id; v_payload := to_jsonb(NEW);
  END IF;
  INSERT INTO public.audit_log (entidade, entidade_id, acao, autor, payload)
  VALUES (TG_TABLE_NAME, v_id, TG_OP, auth.uid(), v_payload);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER aud_pacientes AFTER INSERT OR UPDATE OR DELETE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER aud_profissionais AFTER INSERT OR UPDATE OR DELETE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
CREATE TRIGGER aud_fila AFTER INSERT OR UPDATE OR DELETE ON public.fila FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- =========================================================================
-- SEED DATA
-- =========================================================================
INSERT INTO public.especialidades (id, nome) VALUES
  ('11111111-1111-1111-1111-111111111101','Clínica Geral'),
  ('11111111-1111-1111-1111-111111111102','Pediatria'),
  ('11111111-1111-1111-1111-111111111103','Cardiologia'),
  ('11111111-1111-1111-1111-111111111104','Ortopedia'),
  ('11111111-1111-1111-1111-111111111105','Dermatologia'),
  ('11111111-1111-1111-1111-111111111106','Ginecologia');

INSERT INTO public.pacientes (id, nome, data_nascimento, telefone) VALUES
  ('22222222-2222-2222-2222-222222222201','Ana Beatriz Souza','1989-04-12','(11) 98123-4567'),
  ('22222222-2222-2222-2222-222222222202','Carlos Henrique Lima','1975-11-30','(11) 99234-5678'),
  ('22222222-2222-2222-2222-222222222203','Mariana Oliveira','2002-02-08','(21) 98456-7890'),
  ('22222222-2222-2222-2222-222222222204','João Pedro Santos','2018-06-21','(31) 98765-4321'),
  ('22222222-2222-2222-2222-222222222205','Fernanda Costa','1968-09-15','(11) 97412-3344'),
  ('22222222-2222-2222-2222-222222222206','Rafael Almeida','1995-12-03','(11) 99887-1122'),
  ('22222222-2222-2222-2222-222222222207','Patrícia Mendes','1982-07-19','(11) 98555-9090'),
  ('22222222-2222-2222-2222-222222222208','Lucas Pereira','2010-01-25','(11) 91234-0000'),
  ('22222222-2222-2222-2222-222222222209','Beatriz Ramos','1990-03-11','(11) 98888-7777');

INSERT INTO public.profissionais (id, nome, especialidade_id) VALUES
  ('33333333-3333-3333-3333-333333333301','Dra. Camila Ribeiro','11111111-1111-1111-1111-111111111101'),
  ('33333333-3333-3333-3333-333333333302','Dr. Roberto Nunes','11111111-1111-1111-1111-111111111102'),
  ('33333333-3333-3333-3333-333333333303','Dra. Helena Castro','11111111-1111-1111-1111-111111111103'),
  ('33333333-3333-3333-3333-333333333304','Dr. Marcelo Tavares','11111111-1111-1111-1111-111111111104'),
  ('33333333-3333-3333-3333-333333333305','Dra. Juliana Prado','11111111-1111-1111-1111-111111111105'),
  ('33333333-3333-3333-3333-333333333306','Dr. André Vasconcelos','11111111-1111-1111-1111-111111111106');

INSERT INTO public.fila (paciente_id, profissional_id, prioridade, tipo, data_ultima_consulta, observacoes, status) VALUES
  ('22222222-2222-2222-2222-222222222202','33333333-3333-3333-3333-333333333303','urgencia','primeira',NULL,'Dor torácica intensa há 2 horas','aguardando'),
  ('22222222-2222-2222-2222-222222222205','33333333-3333-3333-3333-333333333303','urgencia','retorno','2026-05-10','Hipertensão descompensada','aguardando'),
  ('22222222-2222-2222-2222-222222222204','33333333-3333-3333-3333-333333333302','urgencia','primeira',NULL,'Febre alta com convulsão','aguardando'),
  ('22222222-2222-2222-2222-222222222201','33333333-3333-3333-3333-333333333301','prioridade_exame','primeira',NULL,'Resultado de exame alterado','aguardando'),
  ('22222222-2222-2222-2222-222222222207','33333333-3333-3333-3333-333333333306','prioridade_exame','retorno','2026-04-22','Avaliação de ultrassom','aguardando'),
  ('22222222-2222-2222-2222-222222222203','33333333-3333-3333-3333-333333333305','prioridade_exame','primeira',NULL,'Lesão de pele suspeita','aguardando'),
  ('22222222-2222-2222-2222-222222222206','33333333-3333-3333-3333-333333333304','prioridade_retorno','retorno','2026-06-01','Acompanhamento pós-cirúrgico','aguardando'),
  ('22222222-2222-2222-2222-222222222209','33333333-3333-3333-3333-333333333301','prioridade_retorno','retorno','2026-05-18','Ajuste de medicação','aguardando'),
  ('22222222-2222-2222-2222-222222222208','33333333-3333-3333-3333-333333333302','prioridade_retorno','retorno','2026-06-10','Avaliação de crescimento','aguardando'),
  ('22222222-2222-2222-2222-222222222201','33333333-3333-3333-3333-333333333305','rotina_retorno','retorno','2026-03-15','Check-up dermatológico anual','aguardando'),
  ('22222222-2222-2222-2222-222222222207','33333333-3333-3333-3333-333333333301','rotina_retorno','retorno','2026-04-01','Consulta de rotina','aguardando'),
  ('22222222-2222-2222-2222-222222222209','33333333-3333-3333-3333-333333333306','rotina_retorno','retorno','2026-02-20','Acompanhamento ginecológico','aguardando'),
  ('22222222-2222-2222-2222-222222222203','33333333-3333-3333-3333-333333333301','rotina_retorno','primeira',NULL,'Primeira consulta de rotina','aguardando'),
  ('22222222-2222-2222-2222-222222222206','33333333-3333-3333-3333-333333333303','prioridade_retorno','primeira',NULL,'Encaminhamento da clínica geral','aguardando');
