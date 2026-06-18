export function formatDateBR(iso?: string) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTimeBR(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ageFromBirth(iso: string) {
  const b = new Date(iso + "T00:00:00");
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}

const phoneRegex = /^\(?\d{2}\)?\s?9?\d{4}-?\d{4}$/;
export function isValidBRPhone(v: string) {
  return phoneRegex.test(v.trim());
}

export function maskPhoneBR(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{0,4})(\d{0,4}).*/, (_m, a, b, c) => {
    let s = "";
    if (a) s += `(${a}`;
    if (a.length === 2) s += ") ";
    if (b) s += b;
    if (c) s += `-${c}`;
    return s;
  });
  return d.replace(/(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
}
