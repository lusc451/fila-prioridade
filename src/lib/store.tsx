import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Patient, Professional, QueueEntry, Priority, QueueStatus } from "./types";
import { seedPatients, seedProfessionals, seedQueue } from "./seed";

interface Store {
  patients: Patient[];
  professionals: Professional[];
  queue: QueueEntry[];
  addPatient: (p: Omit<Patient, "id">) => Patient;
  updatePatient: (id: string, p: Partial<Patient>) => void;
  deletePatient: (id: string) => void;
  addProfessional: (p: Omit<Professional, "id">) => Professional;
  updateProfessional: (id: string, p: Partial<Professional>) => void;
  deleteProfessional: (id: string) => void;
  addQueueEntry: (q: Omit<QueueEntry, "id" | "createdAt" | "status"> & { status?: QueueStatus }) => QueueEntry;
  updateQueueEntry: (id: string, q: Partial<QueueEntry>) => void;
  removeQueueEntry: (id: string) => void;
  completeQueueEntry: (id: string) => void;
  setPriority: (id: string, p: Priority) => void;
}

const StoreCtx = createContext<Store | null>(null);

const KEY = "tfila_v1";
const uid = () => Math.random().toString(36).slice(2, 10);

interface Persist {
  patients: Patient[];
  professionals: Professional[];
  queue: QueueEntry[];
}

function load(): Persist {
  if (typeof window === "undefined") return { patients: seedPatients, professionals: seedProfessionals, queue: seedQueue };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { patients: seedPatients, professionals: seedProfessionals, queue: seedQueue };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>(seedPatients);
  const [professionals, setProfessionals] = useState<Professional[]>(seedProfessionals);
  const [queue, setQueue] = useState<QueueEntry[]>(seedQueue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const d = load();
    setPatients(d.patients);
    setProfessionals(d.professionals);
    setQueue(d.queue);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify({ patients, professionals, queue }));
  }, [patients, professionals, queue, hydrated]);

  const store: Store = {
    patients, professionals, queue,
    addPatient: (p) => {
      const np = { ...p, id: uid() };
      setPatients((s) => [...s, np]);
      return np;
    },
    updatePatient: (id, p) => setPatients((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x))),
    deletePatient: (id) => setPatients((s) => s.filter((x) => x.id !== id)),
    addProfessional: (p) => {
      const np = { ...p, id: uid() };
      setProfessionals((s) => [...s, np]);
      return np;
    },
    updateProfessional: (id, p) => setProfessionals((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x))),
    deleteProfessional: (id) => setProfessionals((s) => s.filter((x) => x.id !== id)),
    addQueueEntry: (q) => {
      const nq: QueueEntry = { ...q, id: uid(), createdAt: new Date().toISOString(), status: q.status ?? "ativo" };
      setQueue((s) => [...s, nq]);
      return nq;
    },
    updateQueueEntry: (id, q) => setQueue((s) => s.map((x) => (x.id === id ? { ...x, ...q } : x))),
    removeQueueEntry: (id) => setQueue((s) => s.filter((x) => x.id !== id)),
    completeQueueEntry: (id) => setQueue((s) => s.map((x) => (x.id === id ? { ...x, status: "concluido", completedAt: new Date().toISOString() } : x))),
    setPriority: (id, p) => setQueue((s) => s.map((x) => (x.id === id ? { ...x, priority: p } : x))),
  };

  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error("useStore must be used inside StoreProvider");
  return v;
}
