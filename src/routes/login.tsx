import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Stethoscope, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — TriaFila" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; pass?: string; name?: string; auth?: string }>({});

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/fila" });
  }, [user, authLoading, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err: typeof errors = {};
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err.email = "Informe um e-mail válido.";
    if (!pass || pass.length < 6) err.pass = "A senha deve ter ao menos 6 caracteres.";
    if (mode === "signup" && !name.trim()) err.name = "Informe seu nome completo.";
    setErrors(err);
    if (Object.keys(err).length) return;

    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
        navigate({ to: "/fila" });
      } else {
        const redirectUrl = `${window.location.origin}/fila`;
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password: pass,
          options: { emailRedirectTo: redirectUrl, data: { nome_completo: name.trim() } },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já pode entrar.");
        setMode("signin");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao autenticar.";
      setErrors({ auth: msg.includes("Invalid login") ? "E-mail ou senha incorretos." : msg });
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
            <h2 className="text-2xl font-bold">{mode === "signin" ? "Acessar o sistema" : "Criar conta"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin" ? "Use suas credenciais administrativas para continuar." : "O primeiro usuário criado recebe permissões de administrador."}
            </p>
          </div>

          {errors.auth && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.auth}
            </div>
          )}

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" autoComplete="email" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
            </div>
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pass">Senha</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="pass" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} className="pl-9" value={pass} onChange={(e) => setPass(e.target.value)} aria-invalid={!!errors.pass} />
            </div>
            {errors.pass && <p className="text-xs text-destructive">{errors.pass}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            {mode === "signin" ? "Não tem conta?" : "Já tem conta?"}{" "}
            <button type="button" className="text-primary hover:underline font-medium" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErrors({}); }}>
              {mode === "signin" ? "Criar uma" : "Entrar"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
