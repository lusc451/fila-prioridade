import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ArrowLeft, UserPlus, Save, FileEdit } from "lucide-react";
import { useStore } from "@/lib/store";
import { PRIORITY_META, PRIORITY_ORDER, type Priority } from "@/lib/types";
import { formatDateBR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import PatientForm from "@/components/patient-form";

const searchSchema = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/_app/fila/novo")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Adicionar à fila — TriaFila" }] }),
  component: AddToQueuePage,
});

function AddToQueuePage() {
  const navigate = useNavigate();
  const { id } = useSearch({ from: "/_app/fila/novo" });
  const { patients, professionals, queue, addQueueEntry, updateQueueEntry } = useStore();
  const editing = id ? queue.find((q) => q.id === id) : null;

  const [patientId, setPatientId] = useState<string>(editing?.patientId ?? "");
  const [professionalId, setProfessionalId] = useState<string>(editing?.professionalId ?? "");
  const [firstAppt, setFirstAppt] = useState<"yes" | "no">(editing ? (editing.firstAppointment ? "yes" : "no") : "no");
  const [lastDate, setLastDate] = useState<string>(editing?.lastAppointmentDate ?? "");
  const [notes, setNotes] = useState<string>(editing?.notes ?? "");
  const [priority, setPriority] = useState<Priority | "">(editing?.priority ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newPatientOpen, setNewPatientOpen] = useState(false);

  useEffect(() => {
    if (firstAppt === "yes") setLastDate("");
  }, [firstAppt]);

  const activeProfs = useMemo(() => professionals.filter((p) => p.active), [professionals]);
  const patient = patients.find((p) => p.id === patientId);
  const professional = professionals.find((p) => p.id === professionalId);
  const today = new Date().toISOString().slice(0, 10);

  function validate(forDraft = false) {
    const e: Record<string, string> = {};
    if (!patientId) e.patient = "Selecione um paciente.";
    if (!professionalId) e.prof = "Selecione um profissional.";
    if (professional && !professional.active) e.prof = "O profissional selecionado está inativo.";
    if (firstAppt === "no") {
      if (!lastDate) e.lastDate = "Informe a data da última consulta.";
      else if (lastDate > today) e.lastDate = "A data não pode ser futura.";
    }
    if (notes.length > 500) e.notes = "Máximo de 500 caracteres.";
    if (!forDraft && !priority) e.priority = "Selecione uma classificação de prioridade.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate(false)) {
      toast.error("Verifique os campos destacados.");
      return;
    }
    const payload = {
      patientId,
      professionalId,
      firstAppointment: firstAppt === "yes",
      lastAppointmentDate: firstAppt === "yes" ? undefined : lastDate,
      notes: notes.trim() || undefined,
      priority: priority as Priority,
      status: "ativo" as const,
    };
    try {
      if (editing) {
        await updateQueueEntry(editing.id, payload);
        toast.success("Atendimento atualizado.");
      } else {
        await addQueueEntry(payload);
        toast.success("Adicionado à fila.");
      }
      navigate({ to: "/fila" });
    } catch { /* toast shown */ }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Voltar"><Link to="/fila"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h2 className="text-2xl font-bold">{editing ? "Editar atendimento" : "Adicionar à fila"}</h2>
          <p className="text-sm text-muted-foreground">Preencha os dados do atendimento e classifique a prioridade.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paciente</CardTitle>
          <CardDescription>Selecione um paciente existente ou cadastre um novo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div>
              <Label>Paciente</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger aria-invalid={!!errors.patient}><SelectValue placeholder="Selecione um paciente" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.patient && <p className="text-xs text-destructive mt-1">{errors.patient}</p>}
            </div>
            <Button type="button" variant="outline" onClick={() => setNewPatientOpen(true)}>
              <UserPlus className="h-4 w-4" />Novo paciente
            </Button>
          </div>
          {patient && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm grid sm:grid-cols-3 gap-2">
              <div><span className="text-muted-foreground">Nome:</span> {patient.name}</div>
              <div><span className="text-muted-foreground">Nascimento:</span> {formatDateBR(patient.birthDate)}</div>
              <div><span className="text-muted-foreground">Telefone:</span> {patient.phone}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profissional</CardTitle>
          <CardDescription>Apenas profissionais ativos aparecem na lista.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Profissional</Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger aria-invalid={!!errors.prof}><SelectValue placeholder="Selecione um profissional" /></SelectTrigger>
              <SelectContent>
                {activeProfs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.specialty}</SelectItem>)}
              </SelectContent>
            </Select>
            {errors.prof && <p className="text-xs text-destructive mt-1">{errors.prof}</p>}
          </div>
          {professional && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm grid sm:grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Nome:</span> {professional.name}</div>
              <div><span className="text-muted-foreground">Especialidade:</span> {professional.specialty}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Informações do atendimento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Primeira consulta?</Label>
            <RadioGroup value={firstAppt} onValueChange={(v) => setFirstAppt(v as "yes" | "no")} className="flex gap-6 mt-2">
              <label className="flex items-center gap-2"><RadioGroupItem value="yes" />Sim</label>
              <label className="flex items-center gap-2"><RadioGroupItem value="no" />Não</label>
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="lastDate">Data da última consulta {firstAppt === "no" && <span className="text-destructive">*</span>}</Label>
            <Input id="lastDate" type="date" max={today} value={lastDate} onChange={(e) => setLastDate(e.target.value)} disabled={firstAppt === "yes"} aria-invalid={!!errors.lastDate} />
            {errors.lastDate && <p className="text-xs text-destructive mt-1">{errors.lastDate}</p>}
          </div>
          <div>
            <Label htmlFor="notes">Observações curtas</Label>
            <Textarea
              id="notes"
              maxLength={500}
              rows={3}
              placeholder="Ex.: Retorno solicitado pelo médico, revisão de exames, renovação de receita, avaliação de resultado, acompanhamento de tratamento..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex justify-between mt-1">
              {errors.notes ? <p className="text-xs text-destructive">{errors.notes}</p> : <span />}
              <span className="text-xs text-muted-foreground">{notes.length}/500</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classificação de prioridade</CardTitle>
          <CardDescription>Selecione a cor que melhor representa a urgência do atendimento.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRIORITY_ORDER.map((p) => {
              const meta = PRIORITY_META[p];
              const selected = priority === p;
              return (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPriority(p)}
                  aria-pressed={selected}
                  className={`text-left rounded-lg border-2 p-4 transition focus:outline-none focus-visible:ring-2 ${meta.ringClass} ${selected ? "ring-2 shadow-md" : "border-border opacity-90 hover:opacity-100"}`}
                >
                  <div className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>{meta.short}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{meta.description}</p>
                </button>
              );
            })}
          </div>
          {errors.priority && <p className="text-xs text-destructive mt-2">{errors.priority}</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="ghost" asChild><Link to="/fila">Cancelar</Link></Button>
        <Button onClick={save}><Save className="h-4 w-4" />{editing ? "Salvar alterações" : "Adicionar à fila"}</Button>
      </div>

      <Dialog open={newPatientOpen} onOpenChange={setNewPatientOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo paciente</DialogTitle></DialogHeader>
          <PatientForm
            onSaved={(p) => { setPatientId(p.id); setNewPatientOpen(false); toast.success("Paciente cadastrado."); }}
            onCancel={() => setNewPatientOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
