"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { CONTENT_SOURCE_LABEL, DIFFICULTY_LABEL } from "@/lib/labels";

type Option = { id: string; name: string };

const STATUS = [
  { value: "nunca", label: "Nunca respondidas" },
  { value: "acertadas", label: "Acertadas" },
  { value: "erradas", label: "Erradas" },
  { value: "favoritas", label: "Favoritas" },
  { value: "revisar", label: "Para resolver depois" },
];

export function QuestionFilters({
  competitions,
  boards,
  papers,
  years,
  subjects,
  topics,
}: {
  competitions: Option[];
  boards: Option[];
  papers: Option[];
  years: number[];
  subjects: Option[];
  topics: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("pagina");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const select = (key: string, label: string, options: { value: string; label: string }[], extra?: Record<string, string | null>) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
      {label}
      <NativeSelect value={params.get(key) ?? ""} onChange={(e) => update({ [key]: e.target.value || null, ...extra })} className="h-9 text-sm">
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  const active = ["prova", "concurso", "banca", "ano", "materia", "assunto", "dificuldade", "status", "fonte", "q"].some((k) => params.get(k));

  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || null });
        }}
      >
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no enunciado" className="h-9 pl-9" aria-label="Buscar no enunciado" />
        </div>
        <Button type="submit" size="sm" variant="secondary" className="h-9">
          Buscar
        </Button>
        {active && (
          <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => router.push(pathname)}>
            <X />
            Limpar filtros
          </Button>
        )}
      </form>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {papers.length > 0 && (
          <div className="col-span-2">{select("prova", "Prova oficial", papers.map((p) => ({ value: p.id, label: p.name })))}</div>
        )}
        {select("concurso", "Concurso", competitions.map((c) => ({ value: c.id, label: c.name })))}
        {select("banca", "Banca", boards.map((b) => ({ value: b.id, label: b.name })))}
        {select("ano", "Ano", years.map((y) => ({ value: String(y), label: String(y) })))}
        {select("materia", "Disciplina", subjects.map((s) => ({ value: s.id, label: s.name })), { assunto: null })}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-fg-subtle">
          Assunto
          <NativeSelect
            value={params.get("assunto") ?? ""}
            onChange={(e) => update({ assunto: e.target.value || null })}
            disabled={!params.get("materia")}
            className="h-9 text-sm"
            title={params.get("materia") ? undefined : "Escolha a disciplina primeiro"}
          >
            <option value="">Todos</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        {select("dificuldade", "Dificuldade", Object.entries(DIFFICULTY_LABEL).map(([value, label]) => ({ value, label })))}
        {select("status", "Status", STATUS)}
        {select("fonte", "Origem", (["OFFICIAL", "GENERATED", "USER"] as const).map((value) => ({ value, label: CONTENT_SOURCE_LABEL[value] })))}
      </div>
    </div>
  );
}
