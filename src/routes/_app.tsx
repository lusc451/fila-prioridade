import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import {
  useEffect,
  type ReactNode,
} from "react";
import {
  History,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Stethoscope,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  signOut,
  useAuth,
} from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

/**
 * Navegação principal da área autenticada.
 *
 * Controle de permissões específicas por papel será acrescentado
 * posteriormente quando implementarmos as telas administrativas.
 */
const NAV = [
  {
    to: "/fila",
    label: "Fila de Consultas",
    icon: LayoutDashboard,
  },
  {
    to: "/pacientes",
    label: "Pacientes",
    icon: Users,
  },
  {
    to: "/profissionais",
    label: "Profissionais",
    icon: Stethoscope,
  },
  {
    to: "/historico",
    label: "Histórico",
    icon: History,
  },
] as const;

function AppLayout() {
  const navigate = useNavigate();

  const pathname = useRouterState({
    select: (state) =>
      state.location.pathname,
  });

  const {
    user,
    profile,
    role,
    isActive,
    loading,
    accountError,
  } = useAuth();

  /**
   * ----------------------------------------------------------------
   * 1. USUÁRIO NÃO AUTENTICADO
   * ----------------------------------------------------------------
   *
   * Todas as rotas agrupadas em /_app são privadas.
   */
  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      navigate({
        to: "/login",
        replace: true,
      });
    }
  }, [
    loading,
    user,
    navigate,
  ]);

  /**
   * ----------------------------------------------------------------
   * 2. TROCA OBRIGATÓRIA DE SENHA
   * ----------------------------------------------------------------
   *
   * Um usuário autenticado, ativo e com cadastro consistente não
   * pode acessar nenhuma funcionalidade operacional enquanto
   * must_change_password=true.
   *
   * A rota /alterar-senha fica fora de /_app justamente para que
   * permaneça acessível durante esse bloqueio.
   */
  useEffect(() => {
    if (
      loading ||
      !user ||
      !profile ||
      !role ||
      accountError ||
      isActive !== true
    ) {
      return;
    }

    if (
      profile.must_change_password === true
    ) {
      navigate({
        to: "/alterar-senha",
        replace: true,
      });
    }
  }, [
    loading,
    user,
    profile,
    role,
    accountError,
    isActive,
    navigate,
  ]);

  /**
   * Encerra a sessão e retorna à tela pública de login.
   */
  async function logout() {
    await signOut();

    navigate({
      to: "/login",
      replace: true,
    });
  }

  /**
   * ----------------------------------------------------------------
   * ESTADO 1 — CARREGAMENTO
   * ----------------------------------------------------------------
   *
   * Não renderizamos Outlet enquanto ainda não conhecemos o estado
   * real da conta.
   */
  if (loading) {
    return (
      <AccessStatePage
        title="Carregando"
        description="Validando sua sessão e as permissões de acesso ao sistema."
      />
    );
  }

  /**
   * ----------------------------------------------------------------
   * ESTADO 2 — SEM SESSÃO
   * ----------------------------------------------------------------
   *
   * O useEffect fará o redirecionamento para /login.
   */
  if (!user) {
    return (
      <AccessStatePage
        title="Redirecionando"
        description="Sua sessão não está disponível. Redirecionando para o login."
      />
    );
  }

  /**
   * ----------------------------------------------------------------
   * ESTADO 3 — CONTA INATIVA
   * ----------------------------------------------------------------
   *
   * Nenhum Outlet é renderizado.
   *
   * A RLS também bloqueia as operações no banco, portanto este
   * bloqueio visual não é a única barreira de segurança.
   */
  if (isActive === false) {
    return (
      <AccessStatePage
        title="Conta inativa"
        description="Sua conta está inativa e não possui permissão para utilizar o sistema."
        destructive
        action={
          <Button
            type="button"
            variant="outline"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        }
      />
    );
  }

  /**
   * ----------------------------------------------------------------
   * ESTADO 4 — ERRO OU INCONSISTÊNCIA DE CADASTRO
   * ----------------------------------------------------------------
   *
   * Uma sessão válida do Supabase Auth não é suficiente.
   *
   * O usuário também precisa possuir:
   *
   * - profile interno;
   * - role;
   * - conta ativa.
   */
  if (
    accountError ||
    !profile ||
    !role ||
    isActive !== true
  ) {
    return (
      <AccessStatePage
        title="Acesso indisponível"
        description={
          accountError ??
          "Não foi possível validar completamente o cadastro desta conta."
        }
        destructive
        action={
          <Button
            type="button"
            variant="outline"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        }
      />
    );
  }

  /**
   * ----------------------------------------------------------------
   * ESTADO 5 — SENHA TEMPORÁRIA
   * ----------------------------------------------------------------
   *
   * Mesmo que o usuário tente acessar /fila, /pacientes ou qualquer
   * outra rota diretamente pela URL, nenhum conteúdo operacional é
   * renderizado.
   *
   * O useEffect acima o encaminhará para /alterar-senha.
   */
  if (
    profile.must_change_password === true
  ) {
    return (
      <AccessStatePage
        title="Troca de senha necessária"
        description="Antes de utilizar o sistema, você precisa substituir sua senha temporária por uma senha definitiva."
      />
    );
  }

  /**
   * ----------------------------------------------------------------
   * ESTADO 6 — CONTA VÁLIDA
   * ----------------------------------------------------------------
   *
   * Somente a partir deste ponto a aplicação operacional é
   * efetivamente renderizada.
   */

  const currentTitle =
    NAV.find((item) =>
      pathname.startsWith(item.to),
    )?.label ?? "TriaFila";

  return (
    <SidebarProvider>
      <div className="min-h-dvh flex w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <Stethoscope className="h-4 w-4" />
              </div>

              <span className="font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
                TriaFila
              </span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>
                Navegação
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.map((item) => (
                    <SidebarMenuItem
                      key={item.to}
                    >
                      <SidebarMenuButton
                        asChild
                        isActive={pathname.startsWith(
                          item.to,
                        )}
                        tooltip={item.label}
                      >
                        <Link to={item.to}>
                          <item.icon className="h-4 w-4" />
                          <span>
                            {item.label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>
                Ações
              </SidebarGroupLabel>

              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Adicionar à fila"
                    >
                      <Link to="/fila/novo">
                        <PlusCircle className="h-4 w-4" />
                        <span>
                          Adicionar à fila
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={logout}
                  tooltip="Sair"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-10 h-14 flex items-center gap-3 border-b bg-background/95 backdrop-blur px-4">
            <SidebarTrigger />

            <h1 className="text-base font-semibold truncate">
              {currentTitle}
            </h1>

            <div className="ml-auto hidden sm:block">
              <Button
                asChild
                size="sm"
              >
                <Link to="/fila/novo">
                  <PlusCircle className="h-4 w-4" />
                  Adicionar à fila
                </Link>
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

/**
 * Tela neutra utilizada enquanto o acesso à área interna está
 * sendo determinado ou quando a conta não pode utilizar o sistema.
 *
 * Manter esse estado fora do layout operacional impede que menus,
 * dados ou Outlets internos sejam renderizados antes da autorização.
 */
function AccessStatePage({
  title,
  description,
  destructive = false,
  action,
}: {
  title: string;
  description: string;
  destructive?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Stethoscope className="h-6 w-6" />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">
            {title}
          </h1>

          <p
            className={
              destructive
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {description}
          </p>
        </div>

        {action && (
          <div className="flex justify-center">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}