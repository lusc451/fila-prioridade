import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { formatDateBR, ageFromBirth } from "@/lib/format";
import PatientForm from "@/components/patient-form";
import type { Patient } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pacientes")({
  head: () => ({ meta: [{ title: "Pacientes — TriaFila" }] }),
  component: PatientsPage,
});

function PatientsPage() {
  const { patients, deletePatient } = useStore();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Patient | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(t) || p.phone.toLowerCase().includes(t));
  }, [patients, q]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Pacientes</CardTitle>
              <CardDescription>Cadastre e gerencie pacientes do sistema.</CardDescription>
            </div>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Novo paciente</Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Nascimento</TableHead>
                  <TableHead>Idade</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Observações</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum paciente encontrado.</TableCell></TableRow>
                )}
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{formatDateBR(p.birthDate)}</TableCell>
                    <TableCell>{ageFromBirth(p.birthDate)}</TableCell>
                    <TableCell>{p.phone}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{p.notes || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo paciente</DialogTitle></DialogHeader>
          <PatientForm
            onSaved={() => { setCreating(false); toast.success("Paciente cadastrado."); }}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar paciente</DialogTitle></DialogHeader>
          {editing && (
            <PatientForm
              patient={editing}
              onSaved={() => { setEditing(null); toast.success("Paciente atualizado."); }}
              onCancel={() => setEditing(null)}
              onDelete={(id) => {
                if (confirm("Excluir este paciente? Esta ação não pode ser desfeita.")) {
                  deletePatient(id);
                  setEditing(null);
                  toast.success("Paciente excluído.");
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
