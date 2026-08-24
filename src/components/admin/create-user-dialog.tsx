import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
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

/**
 * Papéis que podem acessar o gerenciamento administrativo.
 */
type ManagementRole = "developer" | "admin";

/**
 * Todos os papéis que podem ser atribuídos a uma conta.
 */
type AppRole = "developer" | "admin" | "usuario";

/**
 * Cargos atualmente suportados pelo schema da aplicação.
 */
type CargoUsuario = "enfermeiro" | "tecnico_enfermagem" | "recepcao";

/**
 * Propriedades necessárias para utilizar o formulário.
 *
 * O componente não conhece a implementação da listagem.
 * Após uma criação bem-sucedida, apenas informa ao componente
 * pai através de onCreated().
 */
type CreateUserDialogProps = {
  actorRole: ManagementRole;

  /**
   * JWT da sessão atualmente autenticada.
   *
   * O token é utilizado exclusivamente no header Authorization
   * da requisição ao backend.
   *
   * Ele nunca é registrado em logs.
   */
  accessToken: string | null;

  /**
   * Callback chamado depois que o backend confirma a criação.
   *
   * Na Parte 2 utilizaremos este callback para recarregar
   * automaticamente a listagem de usuários.
   */
  onCreated: () => void;
};

type CreateUserErrors = {
  username?: string;
  nomeCompleto?: string;
  email?: string;
  cargo?: string;
  role?: string;
  temporaryPassword?: string;
  confirmation?: string;
  request?: string;
};

type ErrorApiResponse = {
  success: false;
  error: string;
};

type SuccessApiResponse = {
  success: true;
  user: {
    id: string;
  };
};

type CreateUserApiResponse = SuccessApiResponse | ErrorApiResponse;

/**
 * Papéis exibidos para Developer.
 *
 * Developer pode criar qualquer perfil.
 */
const DEVELOPER_ROLE_OPTIONS: Array<{
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

/**
 * Papéis exibidos para Administrador.
 *
 * Admin não pode criar Developer.
 *
 * Esta restrição existe na UI somente para melhorar a experiência.
 * O endpoint POST /api/admin/users aplica a mesma regra novamente
 * no servidor e continua sendo a barreira efetiva de segurança.
 */
const ADMIN_ROLE_OPTIONS: Array<{
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
 * Validação runtime da resposta HTTP.
 *
 * Não fazemos cast cego de response.json(), pois o conteúdo
 * recebido através da rede é desconhecido em tempo de execução.
 */
function isCreateUserApiResponse(value: unknown): value is CreateUserApiResponse {
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

  const user = record.user as Record<string, unknown>;

  return typeof user.id === "string";
}

/**
 * Valida o mesmo formato estabelecido no backend e no banco.
 *
 * Regras:
 *
 * - entre 3 e 32 caracteres;
 * - primeiro caractere alfanumérico;
 * - somente letras minúsculas;
 * - números;
 * - ponto;
 * - hífen;
 * - underline.
 */
function isValidUsername(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value);
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/**
 * Política de senha utilizada atualmente pelo sistema:
 *
 * - mínimo de 6 caracteres;
 * - ao menos uma letra;
 * - ao menos um número.
 *
 * O Supabase Auth continua sendo responsável pelas verificações
 * adicionais configuradas no ambiente Lovable.
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

export function CreateUserDialog({ actorRole, accessToken, onCreated }: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);

  const [username, setUsername] = useState("");

  const [nomeCompleto, setNomeCompleto] = useState("");

  const [email, setEmail] = useState("");

  const [cargo, setCargo] = useState<CargoUsuario | "">("");

  const [role, setRole] = useState<AppRole>("usuario");

  const [temporaryPassword, setTemporaryPassword] = useState("");

  const [confirmation, setConfirmation] = useState("");

  const [busy, setBusy] = useState(false);

  const [errors, setErrors] = useState<CreateUserErrors>({});

  const roleOptions = actorRole === "developer" ? DEVELOPER_ROLE_OPTIONS : ADMIN_ROLE_OPTIONS;

  /**
   * Limpa integralmente os dados do formulário.
   *
   * Senhas não permanecem em memória de estado após uma
   * criação bem-sucedida ou fechamento voluntário do diálogo.
   */
  function resetForm() {
    setUsername("");
    setNomeCompleto("");
    setEmail("");
    setCargo("");
    setRole("usuario");
    setTemporaryPassword("");
    setConfirmation("");
    setErrors({});
  }

  /**
   * Controla o fechamento do diálogo.
   *
   * Enquanto uma criação está em andamento, impedimos fechamento
   * acidental para não gerar dúvida sobre o resultado da requisição.
   */
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

    const validationErrors: CreateUserErrors = {};

    const normalizedUsername = username.trim().toLowerCase();

    const normalizedEmail = email.trim().toLowerCase();

    const normalizedName = nomeCompleto.trim();

    if (!isValidUsername(normalizedUsername)) {
      validationErrors.username =
        "Informe de 3 a 32 caracteres, começando com letra ou número e utilizando apenas letras minúsculas, números, ponto, hífen ou underline.";
    }

    if (normalizedName.length < 3 || normalizedName.length > 150) {
      validationErrors.nomeCompleto = "O nome completo deve possuir entre 3 e 150 caracteres.";
    }

    if (!isValidEmail(normalizedEmail)) {
      validationErrors.email = "Informe um e-mail válido.";
    }

    if (!cargo) {
      validationErrors.cargo = "Selecione o cargo do usuário.";
    }

    /**
     * Defesa adicional no próprio formulário.
     *
     * Um Admin nunca deveria conseguir selecionar Developer,
     * mas verificamos novamente antes da requisição.
     */
    if (actorRole === "admin" && role === "developer") {
      validationErrors.role = "Administrador não pode criar contas Developer.";
    }

    const passwordError = validateTemporaryPassword(temporaryPassword);

    if (passwordError) {
      validationErrors.temporaryPassword = passwordError;
    }

    if (!confirmation) {
      validationErrors.confirmation = "Confirme a senha temporária.";
    } else if (temporaryPassword !== confirmation) {
      validationErrors.confirmation = "As senhas temporárias não coincidem.";
    }

    if (!accessToken) {
      validationErrors.request = "Sua sessão não está disponível. Entre novamente no sistema.";
    }

    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0 || !cargo || !accessToken) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${accessToken}`,
        },

        body: JSON.stringify({
          email: normalizedEmail,

          username: normalizedUsername,

          nomeCompleto: normalizedName,

          cargo,

          role,

          temporaryPassword,
        }),
      });

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error("O servidor retornou uma resposta inválida.");
      }

      if (!isCreateUserApiResponse(payload)) {
        throw new Error("O servidor retornou uma resposta inesperada.");
      }

      if (!response.ok || payload.success !== true) {
        throw new Error(
          payload.success === false ? payload.error : "Não foi possível criar o usuário.",
        );
      }

      /**
       * A senha temporária não é exibida nem armazenada após
       * o sucesso.
       *
       * Quem criou a conta deve comunicá-la ao usuário pelos
       * canais internos apropriados.
       */
      toast.success("Usuário criado com sucesso.", {
        description: "A conta deverá substituir a senha temporária no primeiro acesso.",
      });

      resetForm();
      setOpen(false);

      /**
       * Informa à página de usuários que a listagem deve
       * ser carregada novamente.
       */
      onCreated();
    } catch (requestError: unknown) {
      const message =
        requestError instanceof Error ? requestError.message : "Não foi possível criar o usuário.";

      setErrors((current) => ({
        ...current,
        request: message,
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus className="h-4 w-4" />
          Novo usuário
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>

          <DialogDescription>
            Cadastre uma conta para acesso interno ao sistema. A senha informada será temporária e
            deverá ser substituída no primeiro acesso.
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
              <Label htmlFor="new-user-username">Usuário</Label>

              <Input
                id="new-user-username"
                value={username}
                autoComplete="off"
                placeholder="ex.: joao.silva"
                disabled={busy}
                aria-invalid={!!errors.username}
                onChange={(event) => {
                  setUsername(event.target.value.toLowerCase());

                  if (errors.username || errors.request) {
                    setErrors((current) => ({
                      ...current,
                      username: undefined,
                      request: undefined,
                    }));
                  }
                }}
              />

              <p className="text-xs text-muted-foreground">
                Será utilizado como identificador interno do usuário.
              </p>

              {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-name">Nome completo</Label>

              <Input
                id="new-user-name"
                value={nomeCompleto}
                autoComplete="name"
                placeholder="Nome do usuário"
                disabled={busy}
                aria-invalid={!!errors.nomeCompleto}
                onChange={(event) => {
                  setNomeCompleto(event.target.value);

                  if (errors.nomeCompleto || errors.request) {
                    setErrors((current) => ({
                      ...current,
                      nomeCompleto: undefined,
                      request: undefined,
                    }));
                  }
                }}
              />

              {errors.nomeCompleto && (
                <p className="text-xs text-destructive">{errors.nomeCompleto}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-email">E-mail</Label>

            <Input
              id="new-user-email"
              type="email"
              value={email}
              autoComplete="email"
              placeholder="usuario@exemplo.com"
              disabled={busy}
              aria-invalid={!!errors.email}
              onChange={(event) => {
                setEmail(event.target.value);

                if (errors.email || errors.request) {
                  setErrors((current) => ({
                    ...current,
                    email: undefined,
                    request: undefined,
                  }));
                }
              }}
            />

            <p className="text-xs text-muted-foreground">
              Necessário para autenticação e recuperação de senha.
            </p>

            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-user-cargo">Cargo</Label>

              <Select
                value={cargo}
                disabled={busy}
                onValueChange={(value) => {
                  setCargo(value as CargoUsuario);

                  if (errors.cargo || errors.request) {
                    setErrors((current) => ({
                      ...current,
                      cargo: undefined,
                      request: undefined,
                    }));
                  }
                }}
              >
                <SelectTrigger id="new-user-cargo" aria-invalid={!!errors.cargo}>
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
              <Label htmlFor="new-user-role">Perfil</Label>

              <Select
                value={role}
                disabled={busy}
                onValueChange={(value) => {
                  setRole(value as AppRole);

                  if (errors.role || errors.request) {
                    setErrors((current) => ({
                      ...current,
                      role: undefined,
                      request: undefined,
                    }));
                  }
                }}
              >
                <SelectTrigger id="new-user-role" aria-invalid={!!errors.role}>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {errors.role && <p className="text-xs text-destructive">{errors.role}</p>}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-user-password">Senha temporária</Label>

              <Input
                id="new-user-password"
                type="password"
                value={temporaryPassword}
                autoComplete="new-password"
                disabled={busy}
                aria-invalid={!!errors.temporaryPassword}
                onChange={(event) => {
                  setTemporaryPassword(event.target.value);

                  if (errors.temporaryPassword || errors.request) {
                    setErrors((current) => ({
                      ...current,
                      temporaryPassword: undefined,
                      request: undefined,
                    }));
                  }
                }}
              />

              <p className="text-xs text-muted-foreground">
                Mínimo de 6 caracteres, contendo letra e número.
              </p>

              {errors.temporaryPassword && (
                <p className="text-xs text-destructive">{errors.temporaryPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-user-password-confirmation">Confirmar senha</Label>

              <Input
                id="new-user-password-confirmation"
                type="password"
                value={confirmation}
                autoComplete="new-password"
                disabled={busy}
                aria-invalid={!!errors.confirmation}
                onChange={(event) => {
                  setConfirmation(event.target.value);

                  if (errors.confirmation || errors.request) {
                    setErrors((current) => ({
                      ...current,
                      confirmation: undefined,
                      request: undefined,
                    }));
                  }
                }}
              />

              {errors.confirmation && (
                <p className="text-xs text-destructive">{errors.confirmation}</p>
              )}
            </div>
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
              {busy ? "Criando..." : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
