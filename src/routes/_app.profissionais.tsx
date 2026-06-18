import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import ProfessionalForm from "@/components/professional-form";
import type { Professional } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profissionais")({
  head: () => ({ meta: [{ title: "Profissionais — TriaFila" }] }),
  component: ProfessionalsPage,
});

function ProfessionalsPage() {
  const { professionals, deleteProfessional } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [editing, setEditing] = useState<Professional | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return professionals.filter((p) => {
      if (status === "active" && !p.active) return false;
      if (status === "inactive" && p.active) return false;
      if (!t) return true;
      return p.name.toLowerCase().includes(t) || p.specialty.toLowerCase().includes(t);
    });
  }, [professionals, q, status]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-start sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Profissionais</CardTitle>
              <CardDescription>Cadastre e gerencie os profissionais de saúde.</CardDescription>
            </div>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Novo profissional</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome ou especialidade" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Especialidade</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum profissional encontrado.</TableCell></TableRow>
                )}
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.specialty}</TableCell>
                    <TableCell>{p.contact || "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${p.active ? "bg-[var(--priority-routine)]/15 text-[var(--priority-routine)]" : "bg-muted text-muted-foreground"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${p.active ? "bg-[var(--priority-routine)]" : "bg-muted-foreground"}`} />
                        {p.active ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
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
          <DialogHeader><DialogTitle>Novo profissional</DialogTitle></DialogHeader>
          <ProfessionalForm
            onSaved={() => { setCreating(false); toast.success("Profissional cadastrado."); }}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar profissional</DialogTitle></DialogHeader>
          {editing && (
            <ProfessionalForm
              professional={editing}
              onSaved={() => { setEditing(null); toast.success("Profissional atualizado."); }}
              onCancel={() => setEditing(null)}
              onDelete={(id) => {
                if (confirm("Excluir este profissional? Esta ação não pode ser desfeita.")) {
                  deleteProfessional(id);
                  setEditing(null);
                  toast.success("Profissional excluído.");
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
