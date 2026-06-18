import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Stethoscope, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — TriaFila" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ user?: string; pass?: string; auth?: string }>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: typeof errors = {};
    if (!user.trim()) err.user = "Informe seu e-mail ou usuário.";
    if (!pass) err.pass = "Informe sua senha.";
    if (Object.keys(err).length) return setErrors(err);

    // Demo: aceita qualquer credencial com senha >= 4
    if (pass.length < 4) {
      setErrors({ auth: "Credenciais inválidas. Tente novamente." });
      return;
    }
    localStorage.setItem("tfila_auth", JSON.stringify({ user, remember }));
    navigate({ to: "/fila" });
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
          <h1 className="text-3xl font-bold leading-tight">Classificação de prioridade e gestão da fila de consultas.</h1>
          <p className="text-sidebar-foreground/80">Organize pacientes, profissionais e atendimentos com clareza e segurança.</p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">© {new Date().getFullYear()} TriaFila — Uso administrativo.</p>
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
            <p className="text-sm text-muted-foreground mt-1">Use suas credenciais administrativas para continuar.</p>
          </div>

          {errors.auth && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.auth}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="user">E-mail ou usuário</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="user" autoComplete="username" className="pl-9" value={user} onChange={(e) => setUser(e.target.value)} aria-invalid={!!errors.user} />
            </div>
            {errors.user && <p className="text-xs text-destructive">{errors.user}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pass">Senha</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="pass" type="password" autoComplete="current-password" className="pl-9" value={pass} onChange={(e) => setPass(e.target.value)} aria-invalid={!!errors.pass} />
            </div>
            {errors.pass && <p className="text-xs text-destructive">{errors.pass}</p>}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
              Lembrar-me
            </label>
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => alert("Um link de recuperação seria enviado ao seu e-mail.")}>
              Esqueci minha senha
            </button>
          </div>

          <Button type="submit" className="w-full">Entrar</Button>

          <p className="text-xs text-muted-foreground text-center">Demonstração: qualquer e-mail e senha com 4+ caracteres.</p>
        </form>
      </div>
    </div>
  );
}
