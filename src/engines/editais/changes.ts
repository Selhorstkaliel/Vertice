import { DATE_LABEL, type DateKey } from "./fields";

/**
 * Retificação versus the edital in force (pure): one change per field whose
 * value differs, with a readable before → after. Fields the retificação does
 * not mention are left alone (a retificação only lists what it changes).
 */

export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  page: number | null;
  quote: string | null;
  summary: string;
}

const brDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
};

export function describeValue(field: string, v: unknown): string {
  if (v === null || v === undefined) return "não informado";
  if (field.startsWith("data:") && typeof v === "string") return brDate(v);
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? "item" : "itens"}`;
  if (typeof v === "object") return "regras alteradas";
  return String(v);
}

export function compareWithCurrent(
  current: Record<string, { value: unknown; label: string }>,
  incoming: Record<string, { value: unknown; label: string; page: number | null; quote: string | null }>,
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, next] of Object.entries(incoming)) {
    const prev = current[field];
    if (prev && stable(prev.value) === stable(next.value)) continue;
    const label = prev?.label ?? next.label;
    const before = prev?.value ?? null;
    out.push({
      field,
      label,
      before,
      after: next.value,
      page: next.page,
      quote: next.quote,
      summary: `${label}: ${describeValue(field, before)} → ${describeValue(field, next.value)}`,
    });
  }
  return out;
}

export const isDateField = (field: string) => field.startsWith("data:");
export const dateFieldLabel = (field: string) => DATE_LABEL[field.split(":")[1] as DateKey] ?? field;
