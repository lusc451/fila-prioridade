# Plano: Sistema completo de Triagem e Fila de Atendimentos na Lovable Cloud

Vou reconstruir o **TriaFila** sobre Lovable Cloud (Postgres + Auth + Server Functions), substituindo o armazenamento em localStorage por um backend real, com controle de acesso por papéis, auditoria, relatórios e exportações.

## 1. Backend (Lovable Cloud)

Ativar Lovable Cloud e criar o schema relacional com migrações:

- `profiles` (1‑para‑1 com `auth.users`): nome completo, ativo, criado_em.
- `user_roles` + enum `app_role` (`admin`, `usuario`) + função `has_role()` *security definer* (padrão obrigatório).
- `especialidades` (catálogo).
- `pacientes` (nome, data_nascimento, telefone, criado_por, criado_em, ativo).
- `profissionais` (nome, especialidade_id, ativo).
- `fila` (paciente_id, profissional_id, prioridade enum, tipo enum [primeira/retorno], data_ultima_consulta, observacoes, status enum [aguardando/concluido/cancelado], criado_por, criado_em, atualizado_em, concluido_em).
- `audit_log` (entidade, entidade_id, acao, autor, payload jsonb, criado_em) — alimentado por triggers nas tabelas de negócio.

Para cada tabela `public.*`: `GRANT` apropriado + `ENABLE RLS` + políticas (leitura para `authenticated`; escrita restrita pelo papel via `has_role`; exclusão lógica apenas para admin). Seed via migração com ≥8 pacientes, ≥5 profissionais, ≥12 entradas de fila distribuídas nas 4 prioridades.

## 2. Autenticação e Papéis

- Login por e‑mail/senha (Lovable Cloud Auth), tela `/auth` pública.
- Layout protegido em `src/routes/_authenticated/` (gerenciado pela integração).
- Subárvore `_authenticated/_admin/` com `beforeLoad` checando `has_role('admin')` via server function.
- Primeiro usuário cadastrado vira admin automaticamente (trigger); demais entram como `usuario`.

## 3. Server Functions (`src/lib/*.functions.ts`)

Todas com `requireSupabaseAuth`, validação Zod e — quando privilegiadas — checagem `has_role`:

- `pacientes`: list/get/create/update/deactivate.
- `profissionais` + `especialidades`: CRUD.
- `fila`: criar entrada, listar ativos (com filtros: profissional, especialidade, prioridade, intervalo de datas), concluir, cancelar, histórico.
- `usuarios` (admin): listar, criar (Auth Admin API via `supabaseAdmin` dentro do handler), alterar papel, desativar.
- `relatorios`: agregações para dashboard (volume por prioridade, por profissional, tempo médio de espera, taxa de conclusão/cancelamento) e datasets para exportação.
- `auditoria` (admin): listar com filtros.

## 4. Frontend (TanStack Start + TanStack Query)

Rotas em pt‑BR, totalmente responsivas, mantendo a identidade visual atual (azul/verde/branco saúde, badges de prioridade vermelho/laranja/azul/verde):

- `/auth` — login + cadastro.
- `/_authenticated/fila` — fila ativa ordenada por prioridade + chegada, filtros, ações concluir/cancelar.
- `/_authenticated/fila/novo` — formulário de nova entrada (paciente, profissional, prioridade, tipo, data última consulta condicional, observações).
- `/_authenticated/pacientes` — CRUD + busca.
- `/_authenticated/profissionais` — CRUD + especialidades.
- `/_authenticated/historico` — atendimentos concluídos/cancelados com filtros.
- `/_authenticated/relatorios` — dashboard com gráficos (recharts) + botões Exportar PDF / Exportar Excel.
- `/_authenticated/_admin/usuarios` — gestão de usuários e papéis.
- `/_authenticated/_admin/auditoria` — log de auditoria.

Estado: TanStack Query (loaders chamam `ensureQueryData`, componentes usam `useSuspenseQuery`). Validação com `zod` + `react-hook-form`. Feedback com `sonner` (toasts) e estados de loading/erro nas rotas.

## 5. Exportações

- **PDF**: `pdf-lib` em server function, retornando bytes; o cliente faz download.
- **Excel**: `exceljs` em server function.
- Disponíveis nos relatórios e no histórico (respeitando filtros aplicados).

## 6. Validações

- Nome obrigatório (mín. 2 caracteres).
- Telefone no formato brasileiro `(99) 99999-9999` (regex + máscara).
- Data de nascimento não pode ser futura.
- Data da última consulta obrigatória se tipo = retorno e não pode ser futura.
- Observações ≤ 500 caracteres.
- Validação espelhada no cliente (Zod) e no servidor (mesmo schema).

## Detalhes técnicos

- `supabaseAdmin` carregado apenas dentro de handlers (`await import(...)`).
- Triggers SQL para `updated_at` e para gravar `audit_log`.
- Índices em `fila(status, prioridade, criado_em)`, `fila(profissional_id)`, `pacientes(nome)`.
- Migrações idempotentes; seed roda apenas se as tabelas estiverem vazias.
- Pacotes a instalar: `zod`, `react-hook-form`, `@hookform/resolvers`, `recharts`, `pdf-lib`, `exceljs`, `date-fns`.

## Entregáveis desta execução

1. Habilitar Lovable Cloud.
2. Migrações com schema, RLS, triggers, seed.
3. Server functions completas.
4. Reescrita das rotas/frontend conforme acima.
5. Tela de relatórios com gráficos e exportação PDF/Excel funcionais.
6. Painel de admin (usuários + auditoria).

Confirma para eu começar?
