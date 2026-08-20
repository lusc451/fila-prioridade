import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Papéis reconhecidos pelo schema atual do banco.
 *
 * developer -> administração completa do sistema;
 * admin     -> administração operacional;
 * usuario   -> utilização comum.
 */
export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Perfil interno vinculado ao usuário do Supabase Auth.
 *
 * A autenticação continua sendo responsabilidade de auth.users.
 * Esta tabela armazena somente os dados funcionais utilizados
 * pela aplicação.
 */
export type AuthProfile =
  Database["public"]["Tables"]["profiles"]["Row"];

interface AuthState {
  /**
   * Sessão do Supabase Auth.
   */
  session: Session | null;

  /**
   * Usuário autenticado no Supabase Auth.
   */
  user: User | null;

  /**
   * Perfil funcional existente em public.profiles.
   */
  profile: AuthProfile | null;

  /**
   * Único papel atribuído ao usuário em public.user_roles.
   */
  role: AppRole | null;

  /**
   * Indica se a conta está ativa.
   *
   * null:
   * - usuário ainda não foi carregado;
   * - usuário não está autenticado;
   * - não foi possível determinar o estado.
   */
  isActive: boolean | null;

  /**
   * true enquanto a sessão ou os dados funcionais da conta
   * ainda estão sendo carregados.
   */
  loading: boolean;

  /**
   * Erro relacionado ao carregamento da conta interna.
   *
   * Mantemos separado dos erros de login para permitir que as
   * rotas protegidas tratem inconsistências de cadastro depois.
   */
  accountError: string | null;
}

const AuthCtx = createContext<AuthState>({
  session: null,
  user: null,
  profile: null,
  role: null,
  isActive: null,
  loading: true,
  accountError: null,
});

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [session, setSession] =
    useState<Session | null>(null);

  /**
   * O carregamento é dividido em duas etapas:
   *
   * 1. autenticação:
   *    descoberta da sessão existente no Supabase Auth;
   *
   * 2. conta:
   *    carregamento de profile, role e situação ativa.
   *
   * O contexto só deixa loading=false quando ambas terminam.
   */
  const [authLoading, setAuthLoading] =
    useState(true);

  const [accountLoading, setAccountLoading] =
    useState(false);

  const [profile, setProfile] =
    useState<AuthProfile | null>(null);

  const [role, setRole] =
    useState<AppRole | null>(null);

  const [isActive, setIsActive] =
    useState<boolean | null>(null);

  const [accountError, setAccountError] =
    useState<string | null>(null);

  /**
   * Inicializa e acompanha a sessão do Supabase Auth.
   *
   * Não executamos consultas assíncronas dentro do callback de
   * onAuthStateChange. O callback apenas atualiza o estado da
   * sessão; o carregamento do perfil ocorre no useEffect seguinte.
   */
  useEffect(() => {
    let mounted = true;

    function applySession(
      nextSession: Session | null,
    ) {
      if (!mounted) {
        return;
      }

      setSession(nextSession);

      /**
       * Sempre limpamos os dados funcionais quando a sessão muda.
       *
       * Isso impede que informações do usuário anterior permaneçam
       * temporariamente disponíveis durante login/logout/troca de
       * sessão.
       */
      setProfile(null);
      setRole(null);
      setIsActive(null);
      setAccountError(null);

      /**
       * Se existe usuário autenticado, haverá uma segunda etapa de
       * carregamento para profile e role.
       */
      setAccountLoading(
        Boolean(nextSession?.user),
      );
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        applySession(nextSession);
      },
    );

    /**
     * Recupera a sessão eventualmente persistida pelo Supabase.
     */
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) {
          return;
        }

        if (error) {
          setSession(null);
          setProfile(null);
          setRole(null);
          setIsActive(null);
          setAccountLoading(false);

          setAccountError(
            "Não foi possível recuperar a sessão atual.",
          );

          setAuthLoading(false);
          return;
        }

        applySession(data.session);
        setAuthLoading(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Carrega as informações funcionais da conta autenticada.
   *
   * Esse efeito é executado novamente sempre que o usuário da
   * sessão muda.
   */
  useEffect(() => {
    const userId = session?.user.id;

    if (!userId) {
      setProfile(null);
      setRole(null);
      setIsActive(null);
      setAccountLoading(false);

      return;
    }

    let cancelled = false;

    async function loadAccount() {
      setAccountLoading(true);
      setAccountError(null);

      /**
       * A migration de endurecimento da RLS disponibilizou esta
       * função SECURITY DEFINER especificamente para determinar se
       * a conta autenticada continua ativa.
       *
       * Essa verificação precisa ocorrer antes da leitura de
       * profiles porque contas inativas podem não possuir acesso
       * direto à própria linha em razão das políticas de RLS.
       */
      const {
        data: active,
        error: activeError,
      } = await supabase.rpc(
        "current_user_is_active",
      );

      if (cancelled) {
        return;
      }

      if (activeError) {
        setProfile(null);
        setRole(null);
        setIsActive(null);

        setAccountError(
          "Não foi possível verificar a situação da conta.",
        );

        setAccountLoading(false);
        return;
      }

      /**
       * A função retorna true apenas quando existe um profile ativo
       * correspondente ao usuário autenticado.
       */
      if (active !== true) {
        setProfile(null);
        setRole(null);
        setIsActive(false);
        setAccountLoading(false);

        return;
      }

      setIsActive(true);

      /**
       * Após confirmar que a conta está ativa, carregamos profile
       * e role em paralelo.
       *
       * A migration 2B.3 garante um único papel por usuário.
       */
      const [
        profileResult,
        roleResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            [
              "id",
              "nome_completo",
              "username",
              "cargo",
              "ativo",
              "must_change_password",
              "created_at",
              "updated_at",
            ].join(","),
          )
          .eq("id", userId!)
          .maybeSingle(),

        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId!)
          .maybeSingle(),
      ]);

      if (cancelled) {
        return;
      }

      if (profileResult.error) {
        setProfile(null);
        setRole(null);

        setAccountError(
          "Não foi possível carregar o perfil do usuário.",
        );

        setAccountLoading(false);
        return;
      }

      if (roleResult.error) {
        setProfile(
          profileResult.data as unknown as AuthProfile | null,
        );

        setRole(null);

        setAccountError(
          "Não foi possível carregar as permissões do usuário.",
        );

        setAccountLoading(false);
        return;
      }

      /**
       * Um usuário autenticado válido deve possuir tanto profile
       * quanto role.
       *
       * Caso isso não ocorra, mantemos a sessão, mas sinalizamos
       * explicitamente uma inconsistência de cadastro. A próxima
       * etapa fará o layout protegido bloquear o acesso nesses
       * casos.
       */
      if (!profileResult.data) {
        setProfile(null);
        setRole(
          roleResult.data?.role ?? null,
        );

        setAccountError(
          "A conta autenticada não possui perfil interno.",
        );

        setAccountLoading(false);
        return;
      }

      if (!roleResult.data) {
        setProfile(
          profileResult.data as unknown as AuthProfile,
        );

        setRole(null);

        setAccountError(
          "A conta autenticada não possui perfil de acesso.",
        );

        setAccountLoading(false);
        return;
      }

      setProfile(
        profileResult.data as unknown as AuthProfile,
      );

      setRole(roleResult.data.role);
      setAccountError(null);
      setAccountLoading(false);
    }

    void loadAccount();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  const loading =
    authLoading || accountLoading;

  return (
    <AuthCtx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role,
        isActive,
        loading,
        accountError,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () =>
  useContext(AuthCtx);

/**
 * Encerra a sessão atual.
 *
 * A limpeza de profile, role e demais estados acontece
 * automaticamente quando o Supabase emitir SIGNED_OUT.
 */
export async function signOut() {
  await supabase.auth.signOut();
}