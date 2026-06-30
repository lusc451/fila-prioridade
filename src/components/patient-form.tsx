import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { isValidBRPhone, maskPhoneBR } from "@/lib/format";
import type { Patient } from "@/lib/types";

interface Props {
  patient?: Patient;
  onSaved: (p: Patient) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

export default function PatientForm({ patient, onSaved, onCancel, onDelete }: Props) {
  const { addPatient, updatePatient } = useStore();
  const [name, setName] = useState(patient?.name ?? "");
  const [birthDate, setBirthDate] = useState(patient?.birthDate ?? "");
  const [phone, setPhone] = useState(patient?.phone ?? "");
  const [notes, setNotes] = useState(patient?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const today = new Date().toISOString().slice(0, 10);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = "Nome completo é obrigatório.";
    if (!birthDate) err.birthDate = "Data de nascimento é obrigatória.";
    else if (birthDate > today) err.birthDate = "A data não pode ser futura.";
    if (!phone.trim()) err.phone = "Telefone é obrigatório.";
    else if (!isValidBRPhone(phone)) err.phone = "Use o formato (DD) 9XXXX-XXXX.";
    setErrors(err);
    if (Object.keys(err).length) return;

    try {
      if (patient) {
        await updatePatient(patient.id, { name: name.trim(), birthDate, phone, notes: notes.trim() || undefined });
        onSaved({ ...patient, name: name.trim(), birthDate, phone, notes: notes.trim() || undefined });
      } else {
        const np = await addPatient({ name: name.trim(), birthDate, phone, notes: notes.trim() || undefined });
        onSaved(np);
      }
    } catch { /* toast shown */ }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="pname">Nome completo *</Label>
        <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
        {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="pbirth">Data de nascimento *</Label>
          <Input id="pbirth" type="date" max={today} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} aria-invalid={!!errors.birthDate} />
          {errors.birthDate && <p className="text-xs text-destructive mt-1">{errors.birthDate}</p>}
        </div>
        <div>
          <Label htmlFor="pphone">Telefone *</Label>
          <Input id="pphone" inputMode="tel" placeholder="(11) 98765-4321" value={phone} onChange={(e) => setPhone(maskPhoneBR(e.target.value))} aria-invalid={!!errors.phone} />
          {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
        </div>
      </div>
      <div>
        <Label htmlFor="pnotes">Observações gerais</Label>
        <Textarea id="pnotes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {patient && onDelete && (
          <Button type="button" variant="destructive" onClick={() => onDelete(patient.id)}>Excluir</Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Salvar</Button>
      </div>
    </form>
  );
}
