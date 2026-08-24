import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { EditUserDialog } from "@/components/admin/edit-user-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/usuarios")({
  head: () => ({
    meta: [
      {
        title: "Usuários — TriaFila",
      },
    ],
  }),

  component: UsersPage,
});

type AppRole = Database["public"]["Enums"]["app_role"];

type CargoUsuario = Database["public"]["Enums"]["cargo_usuario"];

type ManagementRole = Extract<AppRole, "developer" | "admin">;

type ManagedUser = {
  id: string;

  email: string | null;

  nomeCompleto: string | null;

  username: string | null;

  cargo: CargoUsuario | null;

  ativo: boolean | null;

  mustChangePassword: boolean | null;

  role: AppRole | null;

  emailConfirmado: boolean;

  criadoEm: string;

  ultimoLoginEm: string | null;

  cadastroCompleto: boolean;
};

type UsersSuccessResponse = {
  success: true;

  actorRole: ManagementRole;

  users: ManagedUser[];
};

type ErrorResponse = {
  success: false;
  error: string;
};

type UsersResponse = UsersSuccessResponse | ErrorResponse;

/**
 * Valida minimamente o contrato HTTP retornado pelo backend.
 *
 * O TypeScript conhece os tipos em tempo de compilação,
 * mas response.json() continua sendo desconhecido em runtime.
 */
function isUsersResponse(value: unknown): value is UsersResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.success === false) {
    return typeof record.error === "string";
  }

  return (
    record.success === true &&
    (record.actorRole === "developer" || record.actorRole === "admin") &&
    Array.isArray(record.users)
  );
}

function UsersPage() {
  const navigate = useNavigate();

  const { user: currentUser, session, role, loading } = useAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);

  /**
   * A role efetivamente retornada pelo backend administrativo.
   *
   * Ela determina também quais ações administrativas devem
   * ser apresentadas pela interface.
   */
  const [actorRole, setActorRole] = useState<ManagementRole | null>(null);

  const [listLoading, setListLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  /**
   * Toda alteração neste contador dispara uma nova consulta
   * ao GET /api/admin/users.
   *
   * É utilizado por:
   *
   * - botão Atualizar;
   * - criação de usuário;
   * - edição de usuário.
   */
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * Normaliza a role administrativa conhecida pelo contexto.
   *
   * Essa verificação controla apenas a experiência visual.
   * As regras efetivas continuam no backend.
   */
  const managementRole: ManagementRole | null =
    role === "developer" || role === "admin" ? role : null;

  const canManageUsers = managementRole !== null;

  /**
   * Edição de contas existentes é exclusiva do Developer.
   *
   * Utilizamos actorRole, retornada pelo próprio endpoint,
   * para decidir se a coluna de ações deve ser exibida.
   */
  const canEditUsers = actorRole === "developer";

  /**
   * Usuários comuns não permanecem na rota administrativa.
   *
   * Esta proteção não substitui o backend:
   * /api/admin/users continua retornando 403 para role usuario.
   */
  useEffect(() => {
    if (loading) {
      return;
    }

    if (role && !canManageUsers) {
      navigate({
        to: "/fila",
        replace: true,
      });
    }
  }, [loading, role, canManageUsers, navigate]);

  /**
   * Carrega a listagem administrativa utilizando o JWT
   * da sessão atualmente autenticada.
   */
  useEffect(() => {
    if (loading || !canManageUsers) {
      return;
    }

    const accessToken = session?.access_token;

    if (!accessToken) {
      setUsers([]);
      setActorRole(null);

      setError("Sua sessão não está disponível. Entre novamente no sistema.");

      setListLoading(false);

      return;
    }

    const controller = new AbortController();

    let cancelled = false;

    async function loadUsers() {
      setListLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/users", {
          method: "GET",

          headers: {
            Authorization: `Bearer ${accessToken}`,
          },

          signal: controller.signal,
        });

        let payload: unknown;

        try {
          payload = await response.json();
        } catch {
          throw new Error("O servidor retornou uma resposta inválida.");
        }

        if (!isUsersResponse(payload)) {
          throw new Error("O servidor retornou uma resposta inesperada.");
        }

        if (!response.ok || payload.success !== true) {
          if (response.status === 403) {
            navigate({
              to: "/fila",
              replace: true,
            });

            return;
          }

          throw new Error(
            payload.success === false ? payload.error : "Não foi possível carregar os usuários.",
          );
        }

        if (cancelled) {
          return;
        }

        setUsers(payload.users);

        setActorRole(payload.actorRole);
      } catch (requestError: unknown) {
        if (controller.signal.aborted || cancelled) {
          return;
        }

        setUsers([]);
        setActorRole(null);

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Não foi possível carregar os usuários.",
        );
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    void loadUsers();

    return () => {
      cancelled = true;

      controller.abort();
    };
  }, [session?.access_token, loading, canManageUsers, navigate, reloadKey]);

  /**
   * Dispara uma nova consulta administrativa.
   */
  function reloadUsers() {
    setReloadKey((current) => current + 1);
  }

  if (loading) {
    return (
      <UsersPageState
        title="Carregando usuários"
        description="Validando suas permissões de acesso."
      />
    );
  }

  /**
   * O useEffect redirecionará a role usuario para /fila.
   */
  if (!canManageUsers || !managementRole) {
    return (
      <UsersPageState
        title="Acesso restrito"
        description="Você não possui permissão para acessar o gerenciamento de usuários."
      />
    );
  }

  const totalUsers = users.length;

  const activeUsers = users.filter((managedUser) => managedUser.ativo === true).length;

  const pendingPasswords = users.filter(
    (managedUser) => managedUser.mustChangePassword === true,
  ).length;

  const incompleteUsers = users.filter((managedUser) => !managedUser.cadastroCompleto).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Usuários</h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Consulte e cadastre as contas autorizadas a acessar o sistema.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CreateUserDialog
            actorRole={managementRole}
            accessToken={session?.access_token ?? null}
            onCreated={reloadUsers}
          />

          <Button type="button" variant="outline" disabled={listLoading} onClick={reloadUsers}>
            <RefreshCw className={listLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Total"
          value={totalUsers}
          description="Contas cadastradas"
          icon={Users}
        />

        <SummaryCard
          title="Ativos"
          value={activeUsers}
          description="Contas habilitadas"
          icon={CheckCircle2}
        />

        <SummaryCard
          title="Primeiro acesso"
          value={pendingPasswords}
          description="Trocas de senha pendentes"
          icon={Clock3}
        />

        <SummaryCard
          title="Inconsistências"
          value={incompleteUsers}
          description="Cadastros incompletos"
          icon={AlertCircle}
        />
      </div>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Contas cadastradas</CardTitle>

              <p className="mt-1 text-sm text-muted-foreground">
                A listagem combina dados do Supabase Auth, perfil interno e papel de acesso.
              </p>
            </div>

            {actorRole && (
              <Badge variant="secondary">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                Acesso: {formatRole(actorRole)}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-4"
            >
              <p className="font-medium text-destructive">Não foi possível carregar os usuários</p>

              <p className="mt-1 text-sm text-destructive/90">{error}</p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={reloadUsers}
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
            </div>
          ) : listLoading ? (
            <div
              role="status"
              className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"
            >
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Carregando usuários...
            </div>
          ) : users.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
              <UserCog className="h-8 w-8 text-muted-foreground" />

              <p className="font-medium">Nenhum usuário encontrado</p>

              <p className="text-sm text-muted-foreground">
                Ainda não existem contas disponíveis para esta listagem.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>

                    <TableHead>Cargo</TableHead>

                    <TableHead>Perfil</TableHead>

                    <TableHead>Status</TableHead>

                    <TableHead>Primeiro acesso</TableHead>

                    <TableHead>Último login</TableHead>

                    {canEditUsers && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {users.map((managedUser) => (
                    <TableRow key={managedUser.id}>
                      <TableCell>
                        <div className="min-w-52">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {managedUser.nomeCompleto ?? "Nome não informado"}
                            </span>

                            {!managedUser.cadastroCompleto && (
                              <Badge variant="destructive">Incompleto</Badge>
                            )}
                          </div>

                          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            <p>
                              {managedUser.username
                                ? `@${managedUser.username}`
                                : "Username não informado"}
                            </p>

                            <p>{managedUser.email ?? "E-mail não informado"}</p>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>{formatCargo(managedUser.cargo)}</TableCell>

                      <TableCell>
                        <RoleBadge role={managedUser.role} />
                      </TableCell>

                      <TableCell>
                        <StatusBadge active={managedUser.ativo} />
                      </TableCell>

                      <TableCell>
                        <PasswordStatusBadge mustChangePassword={managedUser.mustChangePassword} />
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(managedUser.ultimoLoginEm)}
                      </TableCell>

                      {canEditUsers && (
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <EditUserDialog
                              user={managedUser}
                              currentUserId={currentUser?.id ?? null}
                              accessToken={session?.access_token ?? null}
                              onUpdated={reloadUsers}
                            />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>

          <p className="mt-1 text-2xl font-bold">{value}</p>

          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="grid h-10 w-10 place-items-center rounded-md bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function RoleBadge({ role }: { role: AppRole | null }) {
  if (!role) {
    return <Badge variant="destructive">Sem perfil</Badge>;
  }

  return <Badge variant={role === "developer" ? "default" : "secondary"}>{formatRole(role)}</Badge>;
}

function StatusBadge({ active }: { active: boolean | null }) {
  if (active === true) {
    return <Badge variant="secondary">Ativo</Badge>;
  }

  if (active === false) {
    return <Badge variant="destructive">Inativo</Badge>;
  }

  return <Badge variant="outline">Indefinido</Badge>;
}

function PasswordStatusBadge({ mustChangePassword }: { mustChangePassword: boolean | null }) {
  if (mustChangePassword === true) {
    return <Badge variant="outline">Pendente</Badge>;
  }

  if (mustChangePassword === false) {
    return <Badge variant="secondary">Concluído</Badge>;
  }

  return <Badge variant="destructive">Indefinido</Badge>;
}

function formatRole(role: AppRole): string {
  switch (role) {
    case "developer":
      return "Developer";

    case "admin":
      return "Administrador";

    case "usuario":
      return "Usuário";
  }
}

function formatCargo(cargo: CargoUsuario | null): string {
  switch (cargo) {
    case "enfermeiro":
      return "Enfermeiro";

    case "tecnico_enfermagem":
      return "Técnico em Enfermagem";

    case "recepcao":
      return "Recepção";

    default:
      return "Não informado";
  }
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Nunca";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function UsersPageState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-72 items-center justify-center">
      <div className="max-w-md text-center">
        <UserCog className="mx-auto h-10 w-10 text-muted-foreground" />

        <h2 className="mt-4 text-xl font-semibold">{title}</h2>

        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
