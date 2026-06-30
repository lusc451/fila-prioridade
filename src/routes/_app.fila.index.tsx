import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Plus, Eye, Pencil, Trash2, CheckCircle2, XCircle, Phone, Calendar, ArrowUpDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { PRIORITY_META, PRIORITY_ORDER, type Priority } from "@/lib/types";
import { formatDateBR, formatDateTimeBR, ageFromBirth } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/fila/")({
  head: () => ({ meta: [{ title: "Fila de Consultas — TriaFila" }] }),
  component: QueuePage,
});

type SortKey = "priority" | "createdAt" | "lastAppointmentDate";

function QueuePage() {
  const { queue, patients, professionals, removeQueueEntry, completeQueueEntry, cancelQueueEntry, setPriority } = useStore();
  const [q, setQ] = useState("");
  const [fPriority, setFPriority] = useState<string>("all");
  const [fProf, setFProf] = useState<string>("all");
  const [fSpec, setFSpec] = useState<string>("all");
  const [fFirst, setFFirst] = useState<string>("all");
  const [fLastFrom, setFLastFrom] = useState("");
  const [fLastTo, setFLastTo] = useState("");
  const [fCreated, setFCreated] = useState("");
  const [sort, setSort] = useState<SortKey>("priority");
  const [viewId, setViewId] = useState<string | null>(null);

  const specialties = useMemo(() => Array.from(new Set(professionals.map((p) => p.specialty))).sort(), [professionals]);
  const patientById = useMemo(() => Object.fromEntries(patients.map((p) => [p.id, p])), [patients]);
  const profById = useMemo(() => Object.fromEntries(professionals.map((p) => [p.id, p])), [professionals]);

  const active = queue.filter((x) => x.status === "ativo");

  const counts = useMemo(() => {
    const c: Record<Priority, number> = { urgencia: 0, exame: 0, retorno_prioritario: 0, retorno_rotina: 0 };
    active.forEach((x) => { c[x.priority]++; });
    return c;
  }, [active]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = active.filter((e) => {
      const p = patientById[e.patientId];
      const pr = profById[e.professionalId];
      if (!p || !pr) return false;
      if (term) {
        const hay = `${p.name} ${p.phone} ${pr.name} ${pr.specialty}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (fPriority !== "all" && e.priority !== fPriority) return false;
      if (fProf !== "all" && e.professionalId !== fProf) return false;
      if (fSpec !== "all" && pr.specialty !== fSpec) return false;
      if (fFirst !== "all" && String(e.firstAppointment) !== fFirst) return false;
      if (fLastFrom && (!e.lastAppointmentDate || e.lastAppointmentDate < fLastFrom)) return false;
      if (fLastTo && (!e.lastAppointmentDate || e.lastAppointmentDate > fLastTo)) return false;
      if (fCreated && e.createdAt.slice(0, 10) !== fCreated) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "priority") return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (sort === "createdAt") return b.createdAt.localeCompare(a.createdAt);
      return (b.lastAppointmentDate ?? "").localeCompare(a.lastAppointmentDate ?? "");
    });
    return list;
  }, [active, q, fPriority, fProf, fSpec, fFirst, fLastFrom, fLastTo, fCreated, sort, patientById, profById]);

  const viewing = viewId ? queue.find((x) => x.id === viewId) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {PRIORITY_ORDER.map((p) => {
          const meta = PRIORITY_META[p];
          return (
            <Card key={p}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${meta.dotClass}`} aria-hidden />
                  <CardDescription>{meta.short}</CardDescription>
                </div>
                <CardTitle className="text-3xl">{counts[p]}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Fila ativa</CardTitle>
              <CardDescription>Gerencie e priorize os pacientes aguardando atendimento.</CardDescription>
            </div>
            <Button asChild>
              <Link to="/fila/novo"><Plus className="h-4 w-4" />Adicionar à fila</Link>
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por paciente, telefone, profissional ou especialidade" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={fPriority} onValueChange={setFPriority}>
              <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as prioridades</SelectItem>
                {PRIORITY_ORDER.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].short}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fProf} onValueChange={setFProf}>
              <SelectTrigger><SelectValue placeholder="Profissional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os profissionais</SelectItem>
                {professionals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fSpec} onValueChange={setFSpec}>
              <SelectTrigger><SelectValue placeholder="Especialidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as especialidades</SelectItem>
                {specialties.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fFirst} onValueChange={setFFirst}>
              <SelectTrigger><SelectValue placeholder="Primeira consulta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Primeira consulta (todas)</SelectItem>
                <SelectItem value="true">Sim</SelectItem>
                <SelectItem value="false">Não</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Última consulta de</label>
                <Input type="date" value={fLastFrom} onChange={(e) => setFLastFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">até</label>
                <Input type="date" value={fLastTo} onChange={(e) => setFLastTo(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Entrada na fila</label>
              <Input type="date" value={fCreated} onChange={(e) => setFCreated(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Ordenar por</label>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="priority"><span className="inline-flex items-center gap-2"><ArrowUpDown className="h-3 w-3" />Prioridade</span></SelectItem>
                  <SelectItem value="createdAt">Entrada na fila</SelectItem>
                  <SelectItem value="lastAppointmentDate">Última consulta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>1ª?</TableHead>
                  <TableHead>Última</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Nenhum atendimento encontrado.</TableCell>
                  </TableRow>
                )}
                {filtered.map((e) => {
                  const p = patientById[e.patientId];
                  const pr = profById[e.professionalId];
                  const meta = PRIORITY_META[e.priority];
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{formatDateBR(p.birthDate)} · {ageFromBirth(p.birthDate)} anos</div>
                      </TableCell>
                      <TableCell><span className="inline-flex items-center gap-1 text-sm"><Phone className="h-3 w-3" />{p.phone}</span></TableCell>
                      <TableCell>
                        <div className="font-medium">{pr.name}</div>
                        <div className="text-xs text-muted-foreground">{pr.specialty}</div>
                      </TableCell>
                      <TableCell>{e.firstAppointment ? "Sim" : "Não"}</TableCell>
                      <TableCell>{formatDateBR(e.lastAppointmentDate)}</TableCell>
                      <TableCell><span className="inline-flex items-center gap-1 text-sm"><Calendar className="h-3 w-3" />{formatDateBR(e.createdAt)}</span></TableCell>
                      <TableCell>
                        <Select value={e.priority} onValueChange={(v) => { setPriority(e.id, v as Priority); toast.success("Prioridade atualizada."); }}>
                          <SelectTrigger className={`h-8 w-auto min-w-[160px] border-0 px-2 font-medium ${meta.badgeClass}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_ORDER.map((pk) => (
                              <SelectItem key={pk} value={pk}>
                                <span className="inline-flex items-center gap-2">
                                  <span className={`inline-block h-2 w-2 rounded-full ${PRIORITY_META[pk].dotClass}`} />
                                  {PRIORITY_META[pk].short}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setViewId(e.id)} aria-label="Visualizar"><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" asChild aria-label="Editar">
                            <Link to="/fila/novo" search={{ id: e.id } as never}><Pencil className="h-4 w-4" /></Link>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="Concluir"><CheckCircle2 className="h-4 w-4 text-[var(--priority-routine)]" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Marcar como concluído?</AlertDialogTitle>
                                <AlertDialogDescription>O atendimento sairá da fila ativa e será preservado no histórico.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { completeQueueEntry(e.id); toast.success("Atendimento concluído."); }}>Concluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="Cancelar"><XCircle className="h-4 w-4 text-orange-600" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancelar atendimento?</AlertDialogTitle>
                                <AlertDialogDescription>O atendimento sairá da fila ativa e ficará registrado como cancelado no histórico.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Voltar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { cancelQueueEntry(e.id); toast.success("Atendimento cancelado."); }}>Cancelar atendimento</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" aria-label="Remover"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
                                <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { removeQueueEntry(e.id); toast.success("Removido da fila."); }}>Remover</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent>
          {viewing && (() => {
            const p = patientById[viewing.patientId];
            const pr = profById[viewing.professionalId];
            const meta = PRIORITY_META[viewing.priority];
            return (
              <>
                <DialogHeader>
                  <DialogTitle>Detalhes do atendimento</DialogTitle>
                  <DialogDescription>Informações completas da entrada na fila.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Paciente:</span> <strong>{p.name}</strong> ({formatDateBR(p.birthDate)})</div>
                  <div><span className="text-muted-foreground">Telefone:</span> {p.phone}</div>
                  <div><span className="text-muted-foreground">Profissional:</span> {pr.name} — {pr.specialty}</div>
                  <div><span className="text-muted-foreground">Primeira consulta:</span> {viewing.firstAppointment ? "Sim" : "Não"}</div>
                  <div><span className="text-muted-foreground">Última consulta:</span> {formatDateBR(viewing.lastAppointmentDate)}</div>
                  <div><span className="text-muted-foreground">Entrada:</span> {formatDateTimeBR(viewing.createdAt)}</div>
                  <div><span className="text-muted-foreground">Observações:</span> {viewing.notes || "—"}</div>
                  <div className={`inline-block rounded px-2 py-1 text-xs font-medium ${meta.badgeClass}`}>{meta.short}</div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
