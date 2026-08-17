import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "./auth";
import {
  type Patient, type Professional, type QueueEntry, type Priority, type QueueStatus,
  priorityToDb, priorityFromDb, statusToDb, statusFromDb,
  type DbPriority, type DbStatus,
} from "./types";
import { toast } from "sonner";

interface Specialty { id: string; name: string }

type PatientUpdate = Database["public"]["Tables"]["pacientes"]["Update"];
type ProfessionalUpdate = Database["public"]["Tables"]["profissionais"]["Update"];
type QueueUpdate = Database["public"]["Tables"]["fila"]["Update"];

type ProfessionalWithSpecialty =
  Database["public"]["Tables"]["profissionais"]["Row"] & {
    especialidade: {
      id: string;
      nome: string;
    } | null;
  };

interface Store {
  ready: boolean;
  patients: Patient[];
  professionals: Professional[];
  specialties: Specialty[];
  queue: QueueEntry[];
  reload: () => Promise<void>;
  addPatient: (p: Omit<Patient, "id">) => Promise<Patient>;
  updatePatient: (id: string, p: Partial<Patient>) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;
  addProfessional: (p: Omit<Professional, "id">) => Promise<Professional>;
  updateProfessional: (id: string, p: Partial<Professional>) => Promise<void>;
  deleteProfessional: (id: string) => Promise<void>;
  addSpecialty: (name: string) => Promise<Specialty>;
  addQueueEntry: (q: Omit<QueueEntry, "id" | "createdAt" | "status"> & { status?: QueueStatus }) => Promise<QueueEntry>;
  updateQueueEntry: (id: string, q: Partial<QueueEntry>) => Promise<void>;
  removeQueueEntry: (id: string) => Promise<void>;
  completeQueueEntry: (id: string) => Promise<void>;
  cancelQueueEntry: (id: string) => Promise<void>;
  setPriority: (id: string, p: Priority) => Promise<void>;
}

const StoreCtx = createContext<Store | null>(null);

function err(msg: string, e: unknown) {
  console.error(msg, e);
  const m = e instanceof Error ? e.message : "Erro inesperado.";
  toast.error(`${msg}: ${m}`);
  throw e;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [queue, setQueue] = useState<QueueEntry[]>([]);

  const reload = useCallback(async () => {
    const [pacRes, profRes, espRes, filaRes] = await Promise.all([
      supabase.from("pacientes").select("*").eq("ativo", true).order("nome"),
      supabase.from("profissionais").select("*, especialidade:especialidades(id,nome)").order("nome"),
      supabase.from("especialidades").select("*").eq("ativo", true).order("nome"),
      supabase.from("fila").select("*").order("created_at", { ascending: false }),
    ]);
    if (pacRes.error) return err("Falha ao carregar pacientes", pacRes.error);
    if (profRes.error) return err("Falha ao carregar profissionais", profRes.error);
    if (espRes.error) return err("Falha ao carregar especialidades", espRes.error);
    if (filaRes.error) return err("Falha ao carregar fila", filaRes.error);

    setPatients(pacRes.data.map((r) => ({
      id: r.id, name: r.nome, birthDate: r.data_nascimento, phone: r.telefone,
    })));
    setSpecialties(espRes.data.map((r) => ({ id: r.id, name: r.nome })));
    const professionalRows = profRes.data as ProfessionalWithSpecialty[];
    setProfessionals(professionalRows.map((r) => ({
      id: r.id, name: r.nome,
      specialty: r.especialidade?.nome ?? "",
      specialtyId: r.especialidade_id,
      active: r.ativo,
    })));
    setQueue(filaRes.data.map((r) => ({
      id: r.id,
      patientId: r.paciente_id,
      professionalId: r.profissional_id,
      firstAppointment: r.tipo === "primeira",
      lastAppointmentDate: r.data_ultima_consulta ?? undefined,
      notes: r.observacoes ?? undefined,
      priority: priorityFromDb(r.prioridade as DbPriority),
      createdAt: r.created_at,
      status: statusFromDb(r.status as DbStatus),
      completedAt: r.finalizado_em ?? undefined,
    })));
    setReady(true);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setReady(false); return; }
    reload();
  }, [user, authLoading, reload]);

  // ----- Specialties -----
  async function ensureSpecialty(name: string): Promise<string> {
    const found = specialties.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const { data, error } = await supabase
      .from("especialidades").insert({ nome: name }).select().single();
    if (error) { err("Falha ao criar especialidade", error); return ""; }
    setSpecialties((s) => [...s, { id: data.id, name: data.nome }]);
    return data.id;
  }

  const store: Store = {
    ready, patients, professionals, specialties, queue, reload,

    async addPatient(p) {
      const { data, error } = await supabase.from("pacientes").insert({
        nome: p.name, data_nascimento: p.birthDate, telefone: p.phone,
      }).select().single();
      if (error) { err("Falha ao cadastrar paciente", error); return null as never; }
      const np: Patient = { id: data.id, name: data.nome, birthDate: data.data_nascimento, phone: data.telefone };
      setPatients((s) => [...s, np].sort((a, b) => a.name.localeCompare(b.name)));
      return np;
    },
    async updatePatient(id, p) {
      const patch: PatientUpdate = {};
      if (p.name !== undefined) patch.nome = p.name;
      if (p.birthDate !== undefined) patch.data_nascimento = p.birthDate;
      if (p.phone !== undefined) patch.telefone = p.phone;
      const { error } = await supabase.from("pacientes").update(patch).eq("id", id);
      if (error) return err("Falha ao atualizar paciente", error);
      setPatients((s) => s.map((x) => x.id === id ? { ...x, ...p } : x));
    },
    async deletePatient(id) {
      const { error } = await supabase.from("pacientes").update({ ativo: false }).eq("id", id);
      if (error) return err("Falha ao excluir paciente", error);
      setPatients((s) => s.filter((x) => x.id !== id));
    },

    async addProfessional(p) {
      const specialtyId = p.specialtyId ?? await ensureSpecialty(p.specialty);
      const { data, error } = await supabase.from("profissionais").insert({
        nome: p.name, especialidade_id: specialtyId, ativo: p.active,
      }).select("*, especialidade:especialidades(id,nome)").single();
      if (error) { err("Falha ao cadastrar profissional", error); return null as never; }
      const professionalData = data as ProfessionalWithSpecialty;
      const np: Professional = {
        id: professionalData.id, name: professionalData.nome,
        specialty: professionalData.especialidade?.nome ?? p.specialty,
        specialtyId: professionalData.especialidade_id, active: professionalData.ativo,
      };
      setProfessionals((s) => [...s, np].sort((a, b) => a.name.localeCompare(b.name)));
      return np;
    },
    async updateProfessional(id, p) {
      const patch: ProfessionalUpdate = {};
      if (p.name !== undefined) patch.nome = p.name;
      if (p.active !== undefined) patch.ativo = p.active;
      if (p.specialty !== undefined) patch.especialidade_id = p.specialtyId ?? await ensureSpecialty(p.specialty);
      const { error } = await supabase.from("profissionais").update(patch).eq("id", id);
      if (error) return err("Falha ao atualizar profissional", error);
      setProfessionals((s) => s.map((x) => x.id === id ? { ...x, ...p } : x));
    },
    async deleteProfessional(id) {
      const { error } = await supabase.from("profissionais").update({ ativo: false }).eq("id", id);
      if (error) return err("Falha ao excluir profissional", error);
      setProfessionals((s) => s.map((x) => x.id === id ? { ...x, active: false } : x));
    },

    async addSpecialty(name) {
      const id = await ensureSpecialty(name);
      return { id, name };
    },

    async addQueueEntry(q) {
      const row = {
        paciente_id: q.patientId,
        profissional_id: q.professionalId,
        prioridade: priorityToDb(q.priority),
        tipo: (q.firstAppointment ? "primeira" : "retorno") as "primeira" | "retorno",
        data_ultima_consulta: q.firstAppointment ? null : q.lastAppointmentDate ?? null,
        observacoes: q.notes ?? null,
        status: statusToDb(q.status ?? "ativo"),
      };
      const { data, error } = await supabase.from("fila").insert(row).select().single();
      if (error) { err("Falha ao adicionar à fila", error); return null as never; }
      const nq: QueueEntry = {
        id: data.id,
        patientId: data.paciente_id,
        professionalId: data.profissional_id,
        firstAppointment: data.tipo === "primeira",
        lastAppointmentDate: data.data_ultima_consulta ?? undefined,
        notes: data.observacoes ?? undefined,
        priority: priorityFromDb(data.prioridade as DbPriority),
        createdAt: data.created_at,
        status: statusFromDb(data.status as DbStatus),
        completedAt: data.finalizado_em ?? undefined,
      };
      setQueue((s) => [nq, ...s]);
      return nq;
    },
    async updateQueueEntry(id, q) {
      const patch: QueueUpdate = {};
      if (q.patientId !== undefined) patch.paciente_id = q.patientId;
      if (q.professionalId !== undefined) patch.profissional_id = q.professionalId;
      if (q.priority !== undefined) patch.prioridade = priorityToDb(q.priority);
      if (q.firstAppointment !== undefined) patch.tipo = q.firstAppointment ? "primeira" : "retorno";
      if (q.lastAppointmentDate !== undefined) patch.data_ultima_consulta = q.lastAppointmentDate || null;
      if (q.notes !== undefined) patch.observacoes = q.notes || null;
      if (q.status !== undefined) patch.status = statusToDb(q.status);
      const { error } = await supabase.from("fila").update(patch).eq("id", id);
      if (error) return err("Falha ao atualizar atendimento", error);
      setQueue((s) => s.map((x) => x.id === id ? { ...x, ...q } : x));
    },
    async removeQueueEntry(id) {
      const { error } = await supabase.from("fila").delete().eq("id", id);
      if (error) return err("Falha ao remover atendimento", error);
      setQueue((s) => s.filter((x) => x.id !== id));
    },
    async completeQueueEntry(id) {
      const now = new Date().toISOString();
      const { error } = await supabase.from("fila").update({
        status: "concluido", finalizado_em: now, finalizado_por: user?.id ?? null,
      }).eq("id", id);
      if (error) return err("Falha ao concluir atendimento", error);
      setQueue((s) => s.map((x) => x.id === id ? { ...x, status: "concluido", completedAt: now } : x));
    },
    async cancelQueueEntry(id) {
      const now = new Date().toISOString();
      const { error } = await supabase.from("fila").update({
        status: "cancelado", finalizado_em: now, finalizado_por: user?.id ?? null,
      }).eq("id", id);
      if (error) return err("Falha ao cancelar atendimento", error);
      setQueue((s) => s.map((x) => x.id === id ? { ...x, status: "cancelado", completedAt: now } : x));
    },
    async setPriority(id, p) {
      const { error } = await supabase.from("fila").update({ prioridade: priorityToDb(p) }).eq("id", id);
      if (error) return err("Falha ao atualizar prioridade", error);
      setQueue((s) => s.map((x) => x.id === id ? { ...x, priority: p } : x));
    },
  };

  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}
