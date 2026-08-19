import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock, Stethoscope } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      {
        title: "Redefinir senha — TriaFila",
      },
    ],
  }),
  component: RedefinirSenhaPage,
});

type PasswordErrors = {
  password?: string;
  confirmation?: string;
  auth?: string;
};

function RedefinirSenhaPage() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  /**
   * Enquanto o Supabase processa o link recebido por e-mail,
   * ainda não sabemos se existe uma sessão válida de recuperação.
   */
  const [checkingSession, setCheckingSession] = useState(true);

  /**
   * Uma recuperação de senha bem-sucedida cria uma sessão autenticada
   * temporária para que updateUser() possa alterar a senha.
   */
  const [recoverySessionAvailable, setRecoverySessionAvailable] =
    useState(false);

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<PasswordErrors>({});

  useEffect(() => {
    let mounted = true;

    /**
     * O Supabase emite PASSWORD_RECOVERY quando o usuário acessa a
     * aplicação através de um link válido de recuperação de senha.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" && session) {
        setRecoverySessionAvailable(true);
        setCheckingSession(false);
        setErrors({});
      }

      if (event === "SIGNED_OUT") {
        setRecoverySessionAvailable(false);
      }
    });

    /**
     * Fallback importante:
     *
     * dependendo do momento em que o componente é montado, o cliente
     * Supabase pode já ter processado o link de recuperação.
     *
     * Nesse caso, verificamos a sessão existente diretamente.
     */
    async function checkExistingSession() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error) {
        setErrors({
          auth: "Não foi possível validar o link de recuperação.",
        });

        setCheckingSession(false);
        return;
      }

      if (session) {
        setRecoverySessionAvailable(true);
      }

      setCheckingSession(false);
    }

    void checkExistingSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();

    const validationErrors: PasswordErrors = {};

    if (!password || password.length < 6) {
      validationErrors.password =
        "A nova senha deve ter ao menos 6 caracteres.";
    }

    if (!confirmation) {
      validationErrors.confirmation =
        "Confirme a nova senha.";
    } else if (password !== confirmation) {
      validationErrors.confirmation =
        "As senhas informadas não coincidem.";
    }

    if (!recoverySessionAvailable) {
      validationErrors.auth =
        "O link de recuperação é inválido, expirou ou já foi utilizado.";
    }

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setBusy(true);

    try {
      /**
       * updateUser() altera os dados do usuário autenticado.
       *
       * O link de recuperação cria a sessão necessária para que
       * esta chamada possa alterar a senha com segurança.
       */
      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        throw updateError;
      }

      /**
       * A senha já foi modificada neste ponto.
       *
       * Encerramos a sessão criada pelo processo de recuperação para
       * obrigar o usuário a autenticar novamente usando a nova senha.
       */
      const { error: signOutError } =
        await supabase.auth.signOut();

      if (signOutError) {
        setErrors({
          auth:
            "A senha foi alterada, mas não foi possível encerrar a sessão atual. " +
            "Feche esta página e acesse o sistema novamente.",
        });

        return;
      }

      toast.success(
        "Senha redefinida com sucesso. Entre novamente com a nova senha.",
      );

      navigate({
        to: "/login",
        replace: true,
      });
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : "Não foi possível redefinir a senha.";

      setErrors({
        auth: message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Stethoscope className="h-5 w-5" />
          </div>

          <span className="text-xl font-semibold tracking-tight">
            TriaFila
          </span>
        </div>

        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-bold leading-tight">
            Defina uma nova senha de acesso.
          </h1>

          <p className="text-sidebar-foreground/80">
            Utilize uma nova senha para recuperar o acesso à sua conta no
            sistema.
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

            <span className="text-xl font-semibold">
              TriaFila
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-bold">
              Redefinir senha
            </h2>

            <p className="text-sm text-muted-foreground mt-1">
              Informe e confirme a nova senha que será utilizada para acessar
              o sistema.
            </p>
          </div>

          {checkingSession ? (
            <div
              role="status"
              className="rounded-md border bg-muted/40 px-4 py-3 text-sm"
            >
              Validando o link de recuperação...
            </div>
          ) : recoverySessionAvailable ? (
            <form
              onSubmit={submit}
              className="space-y-6"
              noValidate
            >
              {errors.auth && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {errors.auth}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-password">
                  Nova senha
                </Label>

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    className="pl-9"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    aria-invalid={!!errors.password}
                    disabled={busy}
                  />
                </div>

                {errors.password && (
                  <p className="text-xs text-destructive">
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">
                  Confirmar nova senha
                </Label>

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    className="pl-9"
                    value={confirmation}
                    onChange={(e) =>
                      setConfirmation(e.target.value)
                    }
                    aria-invalid={!!errors.confirmation}
                    disabled={busy}
                  />
                </div>

                {errors.confirmation && (
                  <p className="text-xs text-destructive">
                    {errors.confirmation}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={busy}
              >
                {busy
                  ? "Redefinindo..."
                  : "Redefinir senha"}
              </Button>
            </form>
          ) : (
            <div className="space-y-5">
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                Este link de recuperação é inválido, expirou ou já foi
                utilizado.
              </div>

              <Button
                asChild
                variant="outline"
                className="w-full"
              >
                <Link to="/recuperar-senha">
                  Solicitar novo link
                </Link>
              </Button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para o login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}