import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetPasswordTarget = {
  id: string;

  nomeCompleto: string | null;

  username: string | null;

  email: string | null;
};

type ResetPasswordDialogProps = {
  user: ResetPasswordTarget;

  /**
   * JWT da sessão Developer atualmente autenticada.
   *
   * O token é utilizado somente no header Authorization da
   * requisição e nunca deve ser registrado em logs.
   */
  accessToken: string | null;

  /**
   * Executado após o backend confirmar a redefinição.
   *
   * Na Parte 2 a página /usuarios utilizará este callback para
   * recarregar a listagem e refletir must_change_password=true.
   */
  onReset: () => void;
};

type ResetPasswordErrors = {
  temporaryPassword?: string;
  confirmation?: string;
  request?: string;
};

type SuccessResponse = {
  success: true;

  user: {
    id: string;
    mustChangePassword: true;
  };
};

type ErrorResponse = {
  success: false;
  error: string;
};

type ResetPasswordResponse = SuccessResponse | ErrorResponse;

/**
 * O fluxo é deliberadamente dividido em duas etapas.
 *
 * 1. Confirmação explícita da operação e da conta alvo.
 * 2. Definição da nova senha temporária.
 *
 * Isso reduz o risco de uma redefinição acidental.
 */
type DialogStep = "confirmation" | "password";

/**
 * Valida o contrato HTTP em runtime.
 *
 * response.json() não é confiável apenas por possuir uma
 * tipagem TypeScript no frontend.
 */
function isResetPasswordResponse(value: unknown): value is ResetPasswordResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (record.success === false) {
    return typeof record.error === "string";
  }

  if (
    record.success !== true ||
    typeof record.user !== "object" ||
    record.user === null ||
    Array.isArray(record.user)
  ) {
    return false;
  }

  const responseUser = record.user as Record<string, unknown>;

  return typeof responseUser.id === "string" && responseUser.mustChangePassword === true;
}

/**
 * Mantém a política adotada atualmente pelo sistema e pelo
 * endpoint administrativo:
 *
 * - mínimo de 6 caracteres;
 * - pelo menos uma letra;
 * - pelo menos um número.
 */
function validateTemporaryPassword(password: string): string | null {
  if (password.length < 6) {
    return "A senha temporária deve ter no mínimo 6 caracteres.";
  }

  if (!/\p{L}/u.test(password)) {
    return "A senha temporária deve conter pelo menos uma letra.";
  }

  if (!/[0-9]/.test(password)) {
    return "A senha temporária deve conter pelo menos um número.";
  }

  return null;
}

export function ResetPasswordDialog({ user, accessToken, onReset }: ResetPasswordDialogProps) {
  const [open, setOpen] = useState(false);

  const [step, setStep] = useState<DialogStep>("confirmation");

  const [temporaryPassword, setTemporaryPassword] = useState("");

  const [confirmation, setConfirmation] = useState("");

  const [busy, setBusy] = useState(false);

  const [errors, setErrors] = useState<ResetPasswordErrors>({});

  const displayName = user.nomeCompleto ?? user.username ?? user.email ?? "Usuário";

  /**
   * Remove do estado qualquer senha digitada anteriormente.
   *
   * O componente nunca mantém a senha depois de fechar o diálogo
   * ou concluir a operação.
   */
  function resetDialog() {
    setStep("confirmation");

    setTemporaryPassword("");

    setConfirmation("");

    setErrors({});
  }

  /**
   * Enquanto o POST estiver em andamento, impedimos o fechamento
   * acidental do diálogo.
   */
  function handleOpenChange(nextOpen: boolean) {
    if (busy && !nextOpen) {
      return;
    }

    setOpen(nextOpen);

    if (!nextOpen) {
      resetDialog();
    }
  }

  /**
   * A primeira etapa não executa nenhuma chamada ao backend.
   *
   * O usuário precisa confirmar explicitamente a conta alvo
   * antes de visualizar os campos de senha.
   */
  function continueToPassword() {
    setErrors({});

    setStep("password");
  }

  function returnToConfirmation() {
    if (busy) {
      return;
    }

    setTemporaryPassword("");

    setConfirmation("");

    setErrors({});

    setStep("confirmation");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    const validationErrors: ResetPasswordErrors = {};

    const passwordError = validateTemporaryPassword(temporaryPassword);

    if (passwordError) {
      validationErrors.temporaryPassword = passwordError;
    }

    if (!confirmation) {
      validationErrors.confirmation = "Confirme a nova senha temporária.";
    } else if (temporaryPassword !== confirmation) {
      validationErrors.confirmation = "As senhas temporárias não coincidem.";
    }

    if (!accessToken) {
      validationErrors.request = "Sua sessão não está disponível. Entre novamente no sistema.";
    }

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0 || !accessToken) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${accessToken}`,
        },

        body: JSON.stringify({
          temporaryPassword,
        }),
      });

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("O servidor retornou uma resposta inválida.");
      }

      if (!isResetPasswordResponse(payload)) {
        throw new Error("O servidor retornou uma resposta inesperada.");
      }

      if (!response.ok || payload.success !== true) {
        throw new Error(
          payload.success === false
            ? payload.error
            : "Não foi possível redefinir a senha do usuário.",
        );
      }

      /**
       * A senha temporária não é exibida novamente depois do
       * sucesso nem armazenada em outro estado da aplicação.
       */
      toast.success("Senha redefinida com sucesso.", {
        description: "O usuário deverá definir uma nova senha definitiva no próximo acesso.",
      });

      resetDialog();

      setOpen(false);

      onReset();
    } catch (requestError: unknown) {
      setErrors((current) => ({
        ...current,

        request:
          requestError instanceof Error
            ? requestError.message
            : "Não foi possível redefinir a senha do usuário.",
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Redefinir senha"
          aria-label={`Redefinir senha de ${displayName}`}
        >
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {step === "confirmation" ? (
          <>
            <DialogHeader>
              <DialogTitle>Redefinir senha</DialogTitle>

              <DialogDescription>
                Confirme a conta antes de continuar com a redefinição.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 px-4 py-3">
                <p className="text-sm font-medium">{displayName}</p>

                {user.username && (
                  <p className="mt-1 text-xs text-muted-foreground">@{user.username}</p>
                )}

                {user.email && <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>}
              </div>

              <div className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />

                <div className="space-y-1">
                  <p className="text-sm font-medium">Confirme esta operação</p>

                  <p className="text-sm text-muted-foreground">
                    A senha atual desta conta será substituída. O usuário receberá uma senha
                    temporária e será obrigado a definir uma nova senha definitiva no próximo
                    acesso.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>

              <Button type="button" onClick={continueToPassword}>
                Confirmar e continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nova senha temporária</DialogTitle>

              <DialogDescription>
                Defina a senha que será utilizada por {displayName} somente até a troca obrigatória
                no próximo acesso.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-5" noValidate>
              {errors.request && (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {errors.request}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor={`reset-password-${user.id}`}>Nova senha temporária</Label>

                <Input
                  id={`reset-password-${user.id}`}
                  type="password"
                  value={temporaryPassword}
                  autoComplete="new-password"
                  disabled={busy}
                  aria-invalid={!!errors.temporaryPassword}
                  onChange={(event) => {
                    setTemporaryPassword(event.target.value);

                    setErrors((current) => ({
                      ...current,

                      temporaryPassword: undefined,

                      request: undefined,
                    }));
                  }}
                />

                <p className="text-xs text-muted-foreground">
                  Mínimo de 6 caracteres, contendo pelo menos uma letra e um número.
                </p>

                {errors.temporaryPassword && (
                  <p className="text-xs text-destructive">{errors.temporaryPassword}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`reset-password-confirmation-${user.id}`}>
                  Confirmar senha temporária
                </Label>

                <Input
                  id={`reset-password-confirmation-${user.id}`}
                  type="password"
                  value={confirmation}
                  autoComplete="new-password"
                  disabled={busy}
                  aria-invalid={!!errors.confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);

                    setErrors((current) => ({
                      ...current,

                      confirmation: undefined,

                      request: undefined,
                    }));
                  }}
                />

                {errors.confirmation && (
                  <p className="text-xs text-destructive">{errors.confirmation}</p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={returnToConfirmation}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => handleOpenChange(false)}
                  >
                    Cancelar
                  </Button>

                  <Button type="submit" disabled={busy}>
                    {busy ? "Redefinindo..." : "Redefinir senha"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
