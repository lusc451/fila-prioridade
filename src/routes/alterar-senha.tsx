import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, Lock, Stethoscope } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut, useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/alterar-senha")({
  head: () => ({
    meta: [
      {
        title: "Alterar senha temporária — TriaFila",
      },
    ],
  }),
  component: AlterarSenhaPage,
});

type PasswordChangeErrors = {
  currentPassword?: string;
  newPassword?: string;
  confirmation?: string;
  request?: string;
};

type PasswordChangeResponse =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Verifica se o JSON retornado pelo backend possui o
 * formato esperado.
 */
function isPasswordChangeResponse(value: unknown): value is PasswordChangeResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.success === true) {
    return true;
  }

  return record.success === false && typeof record.error === "string";
}

/**
 * Validação antecipada executada no frontend.
 *
 * O backend executa novamente as mesmas verificações.
 * Portanto, estas regras melhoram a experiência do usuário,
 * mas não constituem a barreira de segurança definitiva.
 */
function validateNewPassword(currentPassword: string, newPassword: string): string | null {
  if (newPassword.length < 6) {
    return "A nova senha deve ter no mínimo 6 caracteres.";
  }

  if (!/\p{L}/u.test(newPassword)) {
    return "A nova senha deve conter pelo menos uma letra.";
  }

  if (!/[0-9]/.test(newPassword)) {
    return "A nova senha deve conter pelo menos um número.";
  }

  if (newPassword === currentPassword) {
    return "A nova senha deve ser diferente da senha temporária.";
  }

  return null;
}

function AlterarSenhaPage() {
  const navigate = useNavigate();

  const { session, user, profile, isActive, loading, accountError } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");

  const [newPassword, setNewPassword] = useState("");

  const [confirmation, setConfirmation] = useState("");

  const [busy, setBusy] = useState(false);

  const [errors, setErrors] = useState<PasswordChangeErrors>({});

  /**
   * Esta é uma rota autenticada.
   *
   * Caso alguém tente acessá-la sem sessão válida,
   * redirecionamos para o login.
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
  }, [loading, user, navigate]);

  /**
   * Se a conta não possui troca obrigatória pendente,
   * não existe motivo para permanecer nesta página.
   *
   * A rota NÃO funciona como mecanismo genérico de
   * alteração voluntária de senha.
   */
  useEffect(() => {
    if (loading || !user || !profile || accountError || isActive !== true) {
      return;
    }

    if (profile.must_change_password !== true) {
      navigate({
        to: "/fila",
        replace: true,
      });
    }
  }, [loading, user, profile, accountError, isActive, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();

    const validationErrors: PasswordChangeErrors = {};

    if (!currentPassword) {
      validationErrors.currentPassword = "Informe a senha temporária atual.";
    }

    if (!newPassword) {
      validationErrors.newPassword = "Informe a nova senha.";
    } else {
      const passwordError = validateNewPassword(currentPassword, newPassword);

      if (passwordError) {
        validationErrors.newPassword = passwordError;
      }
    }

    if (!confirmation) {
      validationErrors.confirmation = "Confirme a nova senha.";
    } else if (newPassword !== confirmation) {
      validationErrors.confirmation = "As senhas informadas não coincidem.";
    }

    const accessToken = session?.access_token;

    if (!accessToken) {
      validationErrors.request = "Sua sessão não está disponível. Entre novamente no sistema.";
    }

    if (!profile || profile.must_change_password !== true) {
      validationErrors.request = "Não existe troca obrigatória de senha pendente para esta conta.";
    }

    if (isActive !== true) {
      validationErrors.request = "Esta conta não está habilitada para utilizar o sistema.";
    }

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    if (!accessToken) {
      return;
    }

    setBusy(true);

    try {
      /**
       * A identidade não é enviada no body.
       *
       * O backend identifica o usuário exclusivamente
       * através do access token presente em Authorization.
       */
      const response = await fetch("/api/complete-password-change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("O servidor retornou uma resposta inválida.");
      }

      if (!isPasswordChangeResponse(payload)) {
        throw new Error("O servidor retornou uma resposta inesperada.");
      }

      if (!response.ok || payload.success !== true) {
        const message =
          payload.success === false ? payload.error : "Não foi possível alterar a senha.";

        setErrors({
          request: message,
        });

        return;
      }

      /**
       * A troca obrigatória foi concluída no backend:
       *
       * - senha alterada no Supabase Auth;
       * - must_change_password=false.
       *
       * Encerramos a sessão atual deliberadamente.
       *
       * Isso garante que o usuário faça uma nova autenticação
       * utilizando a senha definitiva recém-criada.
       */
      await signOut();

      toast.success("Senha definida com sucesso. Entre novamente utilizando sua nova senha.");

      navigate({
        to: "/login",
        replace: true,
      });
    } catch (error: unknown) {
      setErrors({
        request: error instanceof Error ? error.message : "Não foi possível alterar a senha.",
      });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Ainda estamos descobrindo a sessão e os dados funcionais
   * da conta.
   */
  if (loading) {
    return (
      <PasswordChangeShell>
        <div role="status" className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          Carregando informações da conta...
        </div>
      </PasswordChangeShell>
    );
  }

  /**
   * O useEffect fará o redirecionamento para /login.
   *
   * Enquanto isso, não exibimos o formulário.
   */
  if (!user || !session) {
    return (
      <PasswordChangeShell>
        <div role="status" className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          Redirecionando para o login...
        </div>
      </PasswordChangeShell>
    );
  }

  /**
   * Conta inativa.
   *
   * Não disponibilizamos o formulário de senha.
   */
  if (isActive === false) {
    return (
      <PasswordChangeShell>
        <div className="space-y-5">
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            Esta conta está inativa e não pode utilizar o sistema.
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={async () => {
              await signOut();

              navigate({
                to: "/login",
                replace: true,
              });
            }}
          >
            Voltar para o login
          </Button>
        </div>
      </PasswordChangeShell>
    );
  }

  /**
   * Inconsistência entre Auth e os dados internos.
   */
  if (accountError) {
    return (
      <PasswordChangeShell>
        <div className="space-y-5">
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {accountError}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={async () => {
              await signOut();

              navigate({
                to: "/login",
                replace: true,
              });
            }}
          >
            Voltar para o login
          </Button>
        </div>
      </PasswordChangeShell>
    );
  }

  /**
   * Esperamos profile antes de disponibilizar o formulário.
   */
  if (!profile) {
    return (
      <PasswordChangeShell>
        <div role="status" className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          Carregando perfil do usuário...
        </div>
      </PasswordChangeShell>
    );
  }

  /**
   * Caso must_change_password já seja false,
   * o useEffect redirecionará para /fila.
   */
  if (profile.must_change_password !== true) {
    return (
      <PasswordChangeShell>
        <div role="status" className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          Redirecionando para o sistema...
        </div>
      </PasswordChangeShell>
    );
  }

  return (
    <PasswordChangeShell>
      <form onSubmit={submit} className="space-y-6" noValidate>
        <div>
          <h2 className="text-2xl font-bold">Defina sua senha</h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Este é seu primeiro acesso ou sua senha foi redefinida por um administrador. Antes de
            utilizar o sistema, defina uma nova senha definitiva.
          </p>
        </div>

        <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
          <div className="flex gap-3">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

            <div className="space-y-1">
              <p className="font-medium">Requisitos da nova senha</p>

              <p className="text-muted-foreground">
                Utilize pelo menos 6 caracteres, contendo no mínimo uma letra e um número. A nova
                senha deve ser diferente da senha temporária.
              </p>
            </div>
          </div>
        </div>

        {errors.request && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errors.request}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="current-password">Senha temporária atual</Label>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              className="pl-9"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              aria-invalid={!!errors.currentPassword}
              disabled={busy}
            />
          </div>

          {errors.currentPassword && (
            <p className="text-xs text-destructive">{errors.currentPassword}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">Nova senha</Label>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="pl-9"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={!!errors.newPassword}
              disabled={busy}
            />
          </div>

          {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirmar nova senha</Label>

          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="pl-9"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              aria-invalid={!!errors.confirmation}
              disabled={busy}
            />
          </div>

          {errors.confirmation && <p className="text-xs text-destructive">{errors.confirmation}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Definindo senha..." : "Definir nova senha"}
        </Button>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          disabled={busy}
          onClick={async () => {
            await signOut();

            navigate({
              to: "/login",
              replace: true,
            });
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Sair e voltar para o login
        </button>
      </form>
    </PasswordChangeShell>
  );
}

/**
 * Estrutura visual compartilhada entre os diferentes estados
 * da página.
 */
function PasswordChangeShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Stethoscope className="h-5 w-5" />
          </div>

          <span className="text-xl font-semibold tracking-tight">TriaFila</span>
        </div>

        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-bold leading-tight">Primeiro acesso seguro.</h1>

          <p className="text-sidebar-foreground/80">
            Substitua a senha temporária por uma senha definitiva antes de utilizar o sistema.
          </p>
        </div>

        <p className="text-xs text-sidebar-foreground/60">
          © {new Date().getFullYear()} TriaFila — Uso administrativo.
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" />
            </div>

            <span className="text-xl font-semibold">TriaFila</span>
          </div>

          {children}

          <p className="text-center text-xs text-muted-foreground">
            Problemas para acessar sua conta? Procure um administrador do sistema.
          </p>

          <div className="text-center">
            <Link to="/login" className="text-xs text-muted-foreground hover:underline">
              Tela de login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
