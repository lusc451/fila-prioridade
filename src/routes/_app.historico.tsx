import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/lib/store";
import { PRIORITY_META } from "@/lib/types";
import { formatDateBR, formatDateTimeBR } from "@/lib/format";

export const Route = createFileRoute("/_app/historico")({
  head: () => ({ meta: [{ title: "Histórico — TriaFila" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { queue, patients, professionals } = useStore();
  const [q, setQ] = useState("");

  const pById = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients]);
  const dById = useMemo(() => Object.fromEntries(professionals.map((p) => [p.id, p])), [professionals]);

  const completed = useMemo(() => {
    const term = q.trim().toLowerCase();
    return queue
      .filter((x) => x.status === "concluido" || x.status === "cancelado")
      .filter((e) => {
        if (!term) return true;
        const p = pById[e.patientId];
        const d = dById[e.professionalId];
        return `${p?.name ?? ""} ${d?.name ?? ""} ${d?.specialty ?? ""}`.toLowerCase().includes(term);
      })
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  }, [queue, q, pById, dById]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Histórico de atendimentos</CardTitle>
            <CardDescription>Consultas concluídas e canceladas.</CardDescription>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por paciente, profissional ou especialidade" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Finalizado em</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completed.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhum atendimento no histórico.</TableCell></TableRow>
                )}
                {completed.map((e) => {
                  const p = pById[e.patientId];
                  const d = dById[e.professionalId];
                  const meta = PRIORITY_META[e.priority];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{p?.name}</TableCell>
                      <TableCell>{d?.name} <span className="text-muted-foreground text-xs block">{d?.specialty}</span></TableCell>
                      <TableCell><span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}>{meta.short}</span></TableCell>
                      <TableCell>
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${e.status === "concluido" ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"}`}>
                          {e.status === "concluido" ? "Concluído" : "Cancelado"}
                        </span>
                      </TableCell>
                      <TableCell>{formatDateBR(e.createdAt)}</TableCell>
                      <TableCell>{formatDateTimeBR(e.completedAt)}</TableCell>
                      <TableCell className="max-w-[300px] truncate">{e.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
