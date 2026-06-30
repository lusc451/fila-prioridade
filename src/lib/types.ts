export type Priority = "urgencia" | "exame" | "retorno_prioritario" | "retorno_rotina";

export const PRIORITY_ORDER: Priority[] = [
  "urgencia",
  "exame",
  "retorno_prioritario",
  "retorno_rotina",
];

export const PRIORITY_META: Record<
  Priority,
  { label: string; short: string; description: string; badgeClass: string; ringClass: string; dotClass: string }
> = {
  urgencia: {
    label: "Vermelho — Urgência",
    short: "Urgência",
    description: "Casos que necessitam atendimento mais rápido e imediato.",
    badgeClass: "bg-[var(--priority-urgency)] text-[var(--priority-urgency-foreground)]",
    ringClass: "ring-[var(--priority-urgency)] border-[var(--priority-urgency)]",
    dotClass: "bg-[var(--priority-urgency)]",
  },
  exame: {
    label: "Laranja — Prioridade / Exame",
    short: "Prioridade / Exame",
    description: "Pacientes que precisam de avaliação prioritária, análise de exames ou continuidade ágil do cuidado.",
    badgeClass: "bg-[var(--priority-exam)] text-[var(--priority-exam-foreground)]",
    ringClass: "ring-[var(--priority-exam)] border-[var(--priority-exam)]",
    dotClass: "bg-[var(--priority-exam)]",
  },
  retorno_prioritario: {
    label: "Amarelo — Retorno Prioritário",
    short: "Retorno Prioritário",
    description: "Retornos importantes, sem urgência imediata.",
    badgeClass: "bg-[var(--priority-followup)] text-[var(--priority-followup-foreground)]",
    ringClass: "ring-[var(--priority-followup)] border-[var(--priority-followup)]",
    dotClass: "bg-[var(--priority-followup)]",
  },
  retorno_rotina: {
    label: "Verde — Retorno de Rotina",
    short: "Retorno de Rotina",
    description: "Retornos periódicos, renovação de receitas e consultas não urgentes.",
    badgeClass: "bg-[var(--priority-routine)] text-[var(--priority-routine-foreground)]",
    ringClass: "ring-[var(--priority-routine)] border-[var(--priority-routine)]",
    dotClass: "bg-[var(--priority-routine)]",
  },
};

export interface Patient {
  id: string;
  name: string;
  birthDate: string; // ISO yyyy-mm-dd
  phone: string;
  notes?: string;
}

export interface Professional {
  id: string;
  name: string;
  specialty: string; // nome da especialidade
  specialtyId?: string;
  contact?: string;
  active: boolean;
}

export type QueueStatus = "ativo" | "concluido" | "cancelado";

export interface QueueEntry {
  id: string;
  patientId: string;
  professionalId: string;
  firstAppointment: boolean;
  lastAppointmentDate?: string;
  notes?: string;
  priority: Priority;
  createdAt: string; // ISO
  status: QueueStatus;
  completedAt?: string;
}

// ===== DB <-> UI mappers =====
export type DbPriority = "urgencia" | "prioridade_exame" | "prioridade_retorno" | "rotina_retorno";
export type DbStatus = "aguardando" | "concluido" | "cancelado";

export const priorityToDb = (p: Priority): DbPriority =>
  p === "urgencia" ? "urgencia"
  : p === "exame" ? "prioridade_exame"
  : p === "retorno_prioritario" ? "prioridade_retorno"
  : "rotina_retorno";

export const priorityFromDb = (p: DbPriority): Priority =>
  p === "urgencia" ? "urgencia"
  : p === "prioridade_exame" ? "exame"
  : p === "prioridade_retorno" ? "retorno_prioritario"
  : "retorno_rotina";

export const statusToDb = (s: QueueStatus): DbStatus =>
  s === "ativo" ? "aguardando" : s;

export const statusFromDb = (s: DbStatus): QueueStatus =>
  s === "aguardando" ? "ativo" : s;
