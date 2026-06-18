import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { maskPhoneBR } from "@/lib/format";
import type { Professional } from "@/lib/types";

interface Props {
  professional?: Professional;
  onSaved: (p: Professional) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

export default function ProfessionalForm({ professional, onSaved, onCancel, onDelete }: Props) {
  const { addProfessional, updateProfessional } = useStore();
  const [name, setName] = useState(professional?.name ?? "");
  const [specialty, setSpecialty] = useState(professional?.specialty ?? "");
  const [contact, setContact] = useState(professional?.contact ?? "");
  const [active, setActive] = useState(professional?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = "Nome é obrigatório.";
    if (!specialty.trim()) err.specialty = "Especialidade é obrigatória.";
    setErrors(err);
    if (Object.keys(err).length) return;

    if (professional) {
      updateProfessional(professional.id, { name: name.trim(), specialty: specialty.trim(), contact: contact.trim() || undefined, active });
      onSaved({ ...professional, name: name.trim(), specialty: specialty.trim(), contact: contact.trim() || undefined, active });
    } else {
      const np = addProfessional({ name: name.trim(), specialty: specialty.trim(), contact: contact.trim() || undefined, active });
      onSaved(np);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="dname">Nome completo *</Label>
        <Input id="dname" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="dspec">Especialidade *</Label>
          <Input id="dspec" value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-invalid={!!errors.specialty} />
          {errors.specialty && <p className="text-xs text-destructive mt-1">{errors.specialty}</p>}
        </div>
        <div>
          <Label htmlFor="dcontact">Telefone / contato</Label>
          <Input id="dcontact" value={contact} onChange={(e) => setContact(maskPhoneBR(e.target.value))} placeholder="(11) 0000-0000" />
        </div>
      </div>
      <label className="flex items-center justify-between rounded-md border p-3">
        <div>
          <div className="font-medium">Profissional ativo</div>
          <div className="text-xs text-muted-foreground">Apenas ativos podem ser selecionados em novos atendimentos.</div>
        </div>
        <Switch checked={active} onCheckedChange={setActive} />
      </label>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {professional && onDelete && (
          <Button type="button" variant="destructive" onClick={() => onDelete(professional.id)}>Excluir</Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Salvar</Button>
      </div>
    </form>
  );
}
