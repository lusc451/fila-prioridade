import { useMemo, useState, type FormEvent } from "react";
import { Archive, TriangleAlert } from "lucide-react";
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

type ArchiveUserTarget = {
  id: string;

  nomeCompleto: string | null;

  username: string | null;

  email: string | null;
};

type ArchiveUserDialogProps = {
  user: ArchiveUserTarget;

  /**
   * UUID da conta atualmente autenticada.
   *
   * O backend já impede o Developer de arquivar a própria conta.
   * Esta informação é usada somente como proteção adicional
   * na interface.
   */
  currentUserId: string | null;

  /**
   * JWT da sessão Developer.
   *
   * Nunca deve ser persistido, exibido ou registrado em logs.
   */
  accessToken: string | null;

  /**
   * Executado após o backend confirmar o arquivamento.
   *
   * A página /usuarios utilizará este callback para recarregar
   * a listagem imediatamente.
   */
  onArchived: () => void;
};

type ArchiveErrors = {
  confirmation?: string;
  request?: string;
};

type ArchiveSuccessResponse = {
  success: true;

  user: {
    id: string;
    archivedAt: string;
    archivedBy: string;
  };
};

type ErrorResponse = {
  success: false;
  error: string;
};

type ArchiveResponse = ArchiveSuccessResponse | ErrorResponse;

/**
 * Valida a resposta HTTP em runtime.
 *
 * O conteúdo recebido por response.json() não deve ser considerado
 * confiável apenas por a aplicação utilizar TypeScript.
 */
function isArchiveResponse(value: unknown): value is ArchiveResponse {
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

  const archivedUser = record.user as Record<string, unknown>;

  return (
    typeof archivedUser.id === "string" &&
    typeof archivedUser.archivedAt === "string" &&
    typeof archivedUser.archivedBy === "string"
  );
}

/**
 * Normaliza o texto digitado somente para a confirmação.
 *
 * Username e e-mail não são alterados no banco por esta função.
 */
function normalizeConfirmation(value: string): string {
  return value.trim().toLowerCase();
}

export function ArchiveUserDialog({
  user,
  currentUserId,
  accessToken,
  onArchived,
}: ArchiveUserDialogProps) {
  const [open, setOpen] = useState(false);

  const [confirmation, setConfirmation] = useState("");

  const [errors, setErrors] = useState<ArchiveErrors>({});

  const [busy, setBusy] = useState(false);

  const displayName = user.nomeCompleto ?? user.username ?? user.email ?? "Usuário";

  /**
   * Preferimos username como identificador de confirmação.
   *
   * Para um cadastro legado sem username, utilizamos o e-mail.
   */
  const confirmationValue = useMemo(() => {
    return user.username ?? user.email ?? user.id;
  }, [user.email, user.id, user.username]);

  const isCurrentUser = currentUserId === user.id;

  /**
   * Remove informações digitadas sempre que o diálogo é encerrado.
   */
  function resetDialog() {
    setConfirmation("");
    setErrors({});
  }

  /**
   * Durante a requisição evitamos fechamento acidental.
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

  async function submit(event: FormEvent) {
    event.preventDefault();

    const validationErrors: ArchiveErrors = {};

    /**
     * Defesa de interface.
     *
     * Mesmo que esse bloqueio seja removido ou contornado,
     * o endpoint server-side continua rejeitando self-archive.
     */
    if (isCurrentUser) {
      validationErrors.request = "Você não pode arquivar sua própria conta.";
    }

    if (normalizeConfirmation(confirmation) !== normalizeConfirmation(confirmationValue)) {
      validationErrors.confirmation = `Digite "${confirmationValue}" exatamente como informado para confirmar.`;
    }

    if (!accessToken) {
      validationErrors.request = "Sua sessão não está disponível. Entre novamente no sistema.";
    }

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0 || !accessToken || isCurrentUser) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",

        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("O servidor retornou uma resposta inválida.");
      }

      if (!isArchiveResponse(payload)) {
        throw new Error("O servidor retornou uma resposta inesperada.");
      }

      if (!response.ok || payload.success !== true) {
        throw new Error(
          payload.success === false ? payload.error : "Não foi possível arquivar o usuário.",
        );
      }

      /**
       * O arquivamento é lógico:
       *
       * - Auth permanece;
       * - profile permanece;
       * - role permanece;
       * - histórico permanece associado ao UUID.
       */
      toast.success("Usuário arquivado com sucesso.", {
        description: "A conta perdeu o acesso ao sistema, mas seu histórico foi preservado.",
      });

      resetDialog();

      setOpen(false);

      onArchived();
    } catch (requestError: unknown) {
      setErrors((current) => ({
        ...current,

        request:
          requestError instanceof Error
            ? requestError.message
            : "Não foi possível arquivar o usuário.",
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
          disabled={isCurrentUser}
          title={
            isCurrentUser ? "Você não pode arquivar sua própria conta" : `Arquivar ${displayName}`
          }
          aria-label={
            isCurrentUser
              ? "Arquivamento da própria conta indisponível"
              : `Arquivar usuário ${displayName}`
          }
        >
          <Archive className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Arquivar usuário</DialogTitle>

          <DialogDescription>
            Esta operação removerá o acesso da conta ao sistema sem apagar seu histórico.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="rounded-md border bg-muted/40 px-4 py-3">
            <p className="text-sm font-medium">{displayName}</p>

            {user.username && (
              <p className="mt-1 text-xs text-muted-foreground">@{user.username}</p>
            )}

            {user.email && <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>}
          </div>

          <div className="flex gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />

            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">Confirme o arquivamento</p>

              <p className="text-sm text-muted-foreground">
                A conta ficará inativa e não poderá mais utilizar o sistema. Os dados de
                autenticação, perfil, papel de acesso e referências históricas serão preservados.
              </p>
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
            <Label htmlFor={`archive-confirmation-${user.id}`}>Confirmação</Label>

            <p className="text-sm text-muted-foreground">
              Digite <strong className="font-medium text-foreground">{confirmationValue}</strong>{" "}
              para confirmar.
            </p>

            <Input
              id={`archive-confirmation-${user.id}`}
              type="text"
              value={confirmation}
              autoComplete="off"
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>

            <Button type="submit" variant="destructive" disabled={busy}>
              <Archive className="h-4 w-4" />

              {busy ? "Arquivando..." : "Arquivar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
