import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Lock, Mail, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Entrar — TriaFila" }],
  }),
  component: LoginPage,
});

type LoginErrors = {
  email?: string;
  pass?: string;
  auth?: string;
};

function LoginPage() {
  const navigate = useNavigate();

  const { user, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");

  const [pass, setPass] = useState("");

  const [busy, setBusy] = useState(false);

  const [errors, setErrors] = useState<LoginErrors>({});

  /**
   * Um usuário que já possui sessão autenticada
   * não deve permanecer na tela de login.
   *
   * O layout protegido em /_app fará as validações
   * adicionais de:
   *
   * - conta ativa;
   * - profile;
   * - role;
   * - must_change_password.
   */
  useEffect(() => {
    if (!authLoading && user) {
      navigate({
        to: "/fila",
        replace: true,
      });
    }
  }, [user, authLoading, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();

    const validationErrors: LoginErrors = {};

    const normalizedEmail = email.trim();

    /**
     * Validação antecipada de formato.
     *
     * A autenticação efetiva continua sendo
     * realizada pelo Supabase Auth.
     */
    if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
      validationErrors.email = "Informe um e-mail válido.";
    }

    /**
     * O Auth do projeto está configurado com
     * comprimento mínimo de 6 caracteres.
     */
    if (!pass || pass.length < 6) {
      validationErrors.pass = "A senha deve ter ao menos 6 caracteres.";
    }

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setBusy(true);

    try {
      /**
       * Esta página permite exclusivamente autenticação.
       *
       * Não existe mais signUp público no frontend.
       * Novos usuários serão criados posteriormente
       * pela área administrativa do sistema.
       */
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: pass,
      });

      if (error) {
        throw error;
      }

      toast.success("Bem-vindo de volta!");

      /**
       * A rota /fila pertence ao layout protegido.
       *
       * Caso a conta ainda possua
       * must_change_password=true,
       * o próprio _app.tsx redirecionará para
       * /alterar-senha.
       */
      navigate({
        to: "/fila",
        replace: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao autenticar.";

      setErrors({
        auth: message.includes("Invalid login") ? "E-mail ou senha incorretos." : message,
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

          <span className="text-xl font-semibold tracking-tight">TriaFila</span>
        </div>

        <div className="space-y-4 max-w-md">
          <h1 className="text-3xl font-bold leading-tight">
            Classificação de prioridade e gestão da fila de consultas.
          </h1>

          <p className="text-sidebar-foreground/80">
            Organize pacientes, profissionais e atendimentos com clareza e segurança.
          </p>
        </div>

        <p className="text-xs text-sidebar-foreground/60">
          © {new Date().getFullYear()} TriaFila — Uso administrativo.
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-md space-y-6" noValidate>
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" />
            </div>

            <span className="text-xl font-semibold">TriaFila</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold">Acessar o sistema</h2>

            <p className="text-sm text-muted-foreground mt-1">
              Use suas credenciais para continuar.
            </p>
          </div>

          {errors.auth && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errors.auth}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>

            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                id="email"
                type="email"
                autoComplete="email"
                className="pl-9"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);

                  if (errors.email || errors.auth) {
                    setErrors((current) => ({
                      ...current,
                      email: undefined,
                      auth: undefined,
                    }));
                  }
                }}
                aria-invalid={!!errors.email}
                disabled={busy}
              />
            </div>

            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="pass">Senha</Label>

              <Link
                to="/recuperar-senha"
                className="text-sm font-medium text-primary hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>

            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                id="pass"
                type="password"
                autoComplete="current-password"
                className="pl-9"
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value);

                  if (errors.pass || errors.auth) {
                    setErrors((current) => ({
                      ...current,
                      pass: undefined,
                      auth: undefined,
                    }));
                  }
                }}
                aria-invalid={!!errors.pass}
                disabled={busy}
              />
            </div>

            {errors.pass && <p className="text-xs text-destructive">{errors.pass}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Entrando..." : "Entrar"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            O acesso ao sistema é restrito a usuários previamente cadastrados.
          </p>
        </form>
      </div>
    </div>
  );
}
