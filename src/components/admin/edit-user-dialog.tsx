import { useEffect, useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AppRole = "developer" | "admin" | "usuario";

type CargoUsuario = "enfermeiro" | "tecnico_enfermagem" | "recepcao";

type EditableUser = {
  id: string;

  nomeCompleto: string | null;

  username: string | null;

  cargo: CargoUsuario | null;

  role: AppRole | null;

  ativo: boolean | null;
};

type EditUserDialogProps = {
  user: EditableUser;

  /**
   * ID da conta Developer atualmente autenticada.
   *
   * Usamos somente para impedir visualmente que a própria
   * conta seja marcada como inativa.
   *
   * O backend continua aplicando a regra efetiva.
   */
  currentUserId: string | null;

  /**
   * JWT da sessão autenticada.
   *
   * Utilizado somente no header Authorization.
   */
  accessToken: string | null;

  /**
   * Executado após um PATCH confirmado pelo backend.
   *
   * A página pai recarregará a listagem administrativa.
   */
  onUpdated: () => void;
};

type EditUserErrors = {
  username?: string;
  nomeCompleto?: string;
  cargo?: string;
  role?: string;
  ativo?: string;
  request?: string;
};

type SuccessResponse = {
  success: true;

  user: {
    id: string;
  };
};

type ErrorResponse = {
  success: false;
  error: string;
};

type UpdateUserResponse = SuccessResponse | ErrorResponse;

const ROLE_OPTIONS: Array<{
  value: AppRole;
  label: string;
}> = [
  {
    value: "usuario",
    label: "Usuário",
  },
  {
    value: "admin",
    label: "Administrador",
  },
  {
    value: "developer",
    label: "Developer",
  },
];

const CARGO_OPTIONS: Array<{
  value: CargoUsuario;
  label: string;
}> = [
  {
    value: "enfermeiro",
    label: "Enfermeiro",
  },
  {
    value: "tecnico_enfermagem",
    label: "Técnico em Enfermagem",
  },
  {
    value: "recepcao",
    label: "Recepção",
  },
];

/**
 * Valida a resposta HTTP em runtime.
 */
function isUpdateUserResponse(value: unknown): value is UpdateUserResponse {
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

  return typeof responseUser.id === "string";
}

function isValidUsername(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value);
}

export function EditUserDialog({
  user,
  currentUserId,
  accessToken,
  onUpdated,
}: EditUserDialogProps) {
  const [open, setOpen] = useState(false);

  const [username, setUsername] = useState(user.username ?? "");

  const [nomeCompleto, setNomeCompleto] = useState(user.nomeCompleto ?? "");

  const [cargo, setCargo] = useState<CargoUsuario | "">(user.cargo ?? "");

  const [role, setRole] = useState<AppRole | "">(user.role ?? "");

  const [ativo, setAtivo] = useState<"true" | "false">(user.ativo === false ? "false" : "true");

  const [busy, setBusy] = useState(false);

  const [errors, setErrors] = useState<EditUserErrors>({});

  const isOwnAccount = currentUserId === user.id;

  /**
   * Mantém o formulário sincronizado com a linha atualmente
   * recebida pela tabela após cada reload.
   */
  useEffect(() => {
    if (open) {
      return;
    }

    setUsername(user.username ?? "");

    setNomeCompleto(user.nomeCompleto ?? "");

    setCargo(user.cargo ?? "");

    setRole(user.role ?? "");

    setAtivo(user.ativo === false ? "false" : "true");

    setErrors({});
  }, [open, user]);

  function resetForm() {
    setUsername(user.username ?? "");

    setNomeCompleto(user.nomeCompleto ?? "");

    setCargo(user.cargo ?? "");

    setRole(user.role ?? "");

    setAtivo(user.ativo === false ? "false" : "true");

    setErrors({});
  }

  function handleOpenChange(nextOpen: boolean) {
    if (busy && !nextOpen) {
      return;
    }

    setOpen(nextOpen);

    if (!nextOpen) {
      resetForm();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    const validationErrors: EditUserErrors = {};

    const normalizedUsername = username.trim().toLowerCase();

    const normalizedName = nomeCompleto.trim();

    /**
     * Uma conta legada pode ainda possuir username NULL.
     *
     * Nesse caso permitimos que o campo permaneça vazio caso
     * o usuário não queira corrigi-lo nesta edição.
     *
     * Se já havia username, apagá-lo não é permitido.
     */
    if (normalizedUsername) {
      if (!isValidUsername(normalizedUsername)) {
        validationErrors.username =
          "Informe de 3 a 32 caracteres, começando com letra ou número e utilizando apenas letras minúsculas, números, ponto, hífen ou underline.";
      }
    } else if (user.username) {
      validationErrors.username = "O usuário não pode ser removido.";
    }

    if (normalizedName.length < 3 || normalizedName.length > 150) {
      validationErrors.nomeCompleto = "O nome completo deve possuir entre 3 e 150 caracteres.";
    }

    if (!cargo && user.cargo) {
      validationErrors.cargo = "O cargo não pode ser removido.";
    }

    if (!role) {
      validationErrors.role = "Selecione o perfil de acesso.";
    }

    if (isOwnAccount && ativo === "false") {
      validationErrors.ativo = "Você não pode inativar sua própria conta.";
    }

    if (!accessToken) {
      validationErrors.request = "Sua sessão não está disponível. Entre novamente no sistema.";
    }

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0 || !role || !accessToken) {
      return;
    }

    /**
     * O PATCH aceita atualizações parciais.
     *
     * Enviamos somente valores realmente alterados.
     */
    const updateBody: Record<string, unknown> = {};

    if (normalizedName !== (user.nomeCompleto ?? "").trim()) {
      updateBody.nomeCompleto = normalizedName;
    }

    if (normalizedUsername && normalizedUsername !== (user.username ?? "").toLowerCase()) {
      updateBody.username = normalizedUsername;
    }

    if (cargo && cargo !== user.cargo) {
      updateBody.cargo = cargo;
    }

    if (role !== user.role) {
      updateBody.role = role;
    }

    const nextActive = ativo === "true";

    if (nextActive !== user.ativo) {
      updateBody.ativo = nextActive;
    }

    if (Object.keys(updateBody).length === 0) {
      setErrors({
        request: "Nenhuma alteração foi realizada.",
      });

      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${accessToken}`,
        },

        body: JSON.stringify(updateBody),
      });

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("O servidor retornou uma resposta inválida.");
      }

      if (!isUpdateUserResponse(payload)) {
        throw new Error("O servidor retornou uma resposta inesperada.");
      }

      if (!response.ok || payload.success !== true) {
        throw new Error(
          payload.success === false ? payload.error : "Não foi possível atualizar o usuário.",
        );
      }

      toast.success("Usuário atualizado com sucesso.");

      setOpen(false);

      onUpdated();
    } catch (requestError: unknown) {
      setErrors((current) => ({
        ...current,

        request:
          requestError instanceof Error
            ? requestError.message
            : "Não foi possível atualizar o usuário.",
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
          title="Editar usuário"
          aria-label={`Editar ${user.nomeCompleto ?? "usuário"}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>

          <DialogDescription>
            Atualize os dados internos, permissões e situação de acesso desta conta.
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

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`edit-user-username-${user.id}`}>Usuário</Label>

              <Input
                id={`edit-user-username-${user.id}`}
                value={username}
                autoComplete="off"
                placeholder="ex.: joao.silva"
                disabled={busy}
                aria-invalid={!!errors.username}
                onChange={(event) => {
                  setUsername(event.target.value.toLowerCase());

                  setErrors((current) => ({
                    ...current,
                    username: undefined,
                    request: undefined,
                  }));
                }}
              />

              {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-user-name-${user.id}`}>Nome completo</Label>

              <Input
                id={`edit-user-name-${user.id}`}
                value={nomeCompleto}
                autoComplete="name"
                disabled={busy}
                aria-invalid={!!errors.nomeCompleto}
                onChange={(event) => {
                  setNomeCompleto(event.target.value);

                  setErrors((current) => ({
                    ...current,
                    nomeCompleto: undefined,
                    request: undefined,
                  }));
                }}
              />

              {errors.nomeCompleto && (
                <p className="text-xs text-destructive">{errors.nomeCompleto}</p>
              )}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`edit-user-cargo-${user.id}`}>Cargo</Label>

              <Select
                value={cargo}
                disabled={busy}
                onValueChange={(value) => {
                  setCargo(value as CargoUsuario);

                  setErrors((current) => ({
                    ...current,
                    cargo: undefined,
                    request: undefined,
                  }));
                }}
              >
                <SelectTrigger id={`edit-user-cargo-${user.id}`} aria-invalid={!!errors.cargo}>
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>

                <SelectContent>
                  {CARGO_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {errors.cargo && <p className="text-xs text-destructive">{errors.cargo}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`edit-user-role-${user.id}`}>Perfil</Label>

              <Select
                value={role}
                disabled={busy}
                onValueChange={(value) => {
                  setRole(value as AppRole);

                  setErrors((current) => ({
                    ...current,
                    role: undefined,
                    request: undefined,
                  }));
                }}
              >
                <SelectTrigger id={`edit-user-role-${user.id}`} aria-invalid={!!errors.role}>
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>

                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {errors.role && <p className="text-xs text-destructive">{errors.role}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`edit-user-status-${user.id}`}>Status</Label>

            <Select
              value={ativo}
              disabled={busy || isOwnAccount}
              onValueChange={(value) => {
                setAtivo(value as "true" | "false");

                setErrors((current) => ({
                  ...current,
                  ativo: undefined,
                  request: undefined,
                }));
              }}
            >
              <SelectTrigger id={`edit-user-status-${user.id}`} aria-invalid={!!errors.ativo}>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="true">Ativo</SelectItem>

                <SelectItem value="false">Inativo</SelectItem>
              </SelectContent>
            </Select>

            {isOwnAccount && (
              <p className="text-xs text-muted-foreground">
                Sua própria conta não pode ser inativada.
              </p>
            )}

            {errors.ativo && <p className="text-xs text-destructive">{errors.ativo}</p>}
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

            <Button type="submit" disabled={busy}>
              {busy ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
