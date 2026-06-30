export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          acao: string
          autor: string | null
          created_at: string
          entidade: string
          entidade_id: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          acao: string
          autor?: string | null
          created_at?: string
          entidade: string
          entidade_id?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          acao?: string
          autor?: string | null
          created_at?: string
          entidade?: string
          entidade_id?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      especialidades: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      fila: {
        Row: {
          created_at: string
          criado_por: string | null
          data_ultima_consulta: string | null
          finalizado_em: string | null
          finalizado_por: string | null
          id: string
          observacoes: string | null
          paciente_id: string
          prioridade: Database["public"]["Enums"]["prioridade_atendimento"]
          profissional_id: string
          status: Database["public"]["Enums"]["status_atendimento"]
          tipo: Database["public"]["Enums"]["tipo_atendimento"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          data_ultima_consulta?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          id?: string
          observacoes?: string | null
          paciente_id: string
          prioridade: Database["public"]["Enums"]["prioridade_atendimento"]
          profissional_id: string
          status?: Database["public"]["Enums"]["status_atendimento"]
          tipo: Database["public"]["Enums"]["tipo_atendimento"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          data_ultima_consulta?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          id?: string
          observacoes?: string | null
          paciente_id?: string
          prioridade?: Database["public"]["Enums"]["prioridade_atendimento"]
          profissional_id?: string
          status?: Database["public"]["Enums"]["status_atendimento"]
          tipo?: Database["public"]["Enums"]["tipo_atendimento"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fila_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fila_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          data_nascimento: string
          id: string
          nome: string
          telefone: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          data_nascimento: string
          id?: string
          nome: string
          telefone: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          data_nascimento?: string
          id?: string
          nome?: string
          telefone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome_completo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id: string
          nome_completo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_completo?: string
          updated_at?: string
        }
        Relationships: []
      }
      profissionais: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          especialidade_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          especialidade_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          especialidade_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profissionais_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "usuario"
      prioridade_atendimento:
        | "urgencia"
        | "prioridade_exame"
        | "prioridade_retorno"
        | "rotina_retorno"
      status_atendimento: "aguardando" | "concluido" | "cancelado"
      tipo_atendimento: "primeira" | "retorno"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "usuario"],
      prioridade_atendimento: [
        "urgencia",
        "prioridade_exame",
        "prioridade_retorno",
        "rotina_retorno",
      ],
      status_atendimento: ["aguardando", "concluido", "cancelado"],
      tipo_atendimento: ["primeira", "retorno"],
    },
  },
} as const
