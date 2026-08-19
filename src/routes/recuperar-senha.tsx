import {
  Link,
  createFileRoute,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  Mail,
  Stethoscope,
} from "lucide-react";
import {
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({
    meta: [
      {
        title: "Recuperar senha — TriaFila",
      },
    ],
  }),
  component: RecuperarSenhaPage,
});

/**
 * URL cadastrada no Lovable Cloud em:
 *
 * Cloud → Users → Auth settings → Redirect URLs
 *
 * O Lovable Cloud não aceitou "localhost" no ambiente local,
 * portanto usamos explicitamente 127.0.0.1 durante o desenvolvimento.
 *
 * Em produção usamos o próprio domínio onde a aplicação estiver hospedada.
 */
function getPasswordResetRedirectUrl() {
  if (import.meta.env.DEV) {
    return "http://127.0.0.1:8080/redefinir-senha";
  }

  return `${window.location.origin}/redefinir-senha`;
}

function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] =
    useState<string | null>(null);

  const [requestError, setRequestError] =
    useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();

    setEmailError(null);
    setRequestError(null);

    const normalizedEmail = email.trim();

    if (
      !normalizedEmail ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)
    ) {
      setEmailError("Informe um e-mail válido.");
      return;
    }

    setBusy(true);

    try {
      const redirectTo =
        getPasswordResetRedirectUrl();

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo,
          },
        );

      if (error) {
        throw error;
      }

      /**
       * A tela não informa se o endereço realmente pertence
       * a uma conta cadastrada.
       *
       * Isso reduz exposição desnecessária sobre quais e-mails
       * existem no sistema.
       */
      setSent(true);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : "Não foi possível solicitar a recuperação da senha.";

      setRequestError(message);
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
            Recuperação segura de acesso.
          </h1>

          <p className="text-sidebar-foreground/80">
            Solicite um link de recuperação para definir uma nova senha de
            acesso ao sistema.
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
              Recuperar senha
            </h2>

            <p className="text-sm text-muted-foreground mt-1">
              Informe o e-mail utilizado no sistema. Se houver uma conta
              correspondente, você receberá as instruções para redefinir sua
              senha.
            </p>
          </div>

          {sent ? (
            <div className="space-y-5">
              <div
                role="status"
                className="rounded-md border bg-muted/40 px-4 py-3 text-sm"
              >
                Se o endereço informado estiver cadastrado, um e-mail de
                recuperação será enviado. Verifique também a caixa de spam.
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                  setEmailError(null);
                  setRequestError(null);
                }}
              >
                Solicitar novamente
              </Button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-6"
              noValidate
            >
              {requestError && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {requestError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="recovery-email">
                  E-mail
                </Label>

                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                  <Input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    className="pl-9"
                    value={email}
                    onChange={(e) =>
                      setEmail(e.target.value)
                    }
                    aria-invalid={!!emailError}
                    disabled={busy}
                  />
                </div>

                {emailError && (
                  <p className="text-xs text-destructive">
                    {emailError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={busy}
              >
                {busy
                  ? "Enviando..."
                  : "Enviar link de recuperação"}
              </Button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para o login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}