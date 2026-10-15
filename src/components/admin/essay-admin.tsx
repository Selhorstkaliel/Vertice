"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import {
  collectThemeBatchAction,
  generateThemesAction,
  publishRubricAction,
  reviewThemeAction,
  saveOfficialThemeAction,
  saveRubricAction,
  submitThemeBatchAction,
} from "@/modules/essays/admin-actions";

type Option = { id: string; name: string };
type ActionResult = { ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string[] | undefined> };

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.fieldErrors ? (Object.values(r.fieldErrors).flat()[0] ?? r.error) : r.error);
      else {
        if (r.message) toast.success(r.message);
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}

export interface RubricFormValue {
  id?: string;
  competitionId: string;
  year: number | null;
  editalUrl: string;
  textType: string;
  minLines: number | null;
  maxLines: number | null;
  charsPerLine: number;
  criteria: { key: string; name: string; description: string; maxScore: number; weight: number }[];
  zeroingRules: string[];
  verified: boolean;
}

const emptyCriterion = { key: "", name: "", description: "", maxScore: 0, weight: 1 };

export function RubricForm({ competitions, initial }: { competitions: Option[]; initial?: RubricFormValue }) {
  const { pending, run } = useRun();
  const [v, setV] = React.useState<RubricFormValue>(
    initial ?? { competitionId: "", year: null, editalUrl: "", textType: "", minLines: null, maxLines: null, charsPerLine: 70, criteria: [{ ...emptyCriterion }], zeroingRules: [], verified: false },
  );
  const [zeroing, setZeroing] = React.useState((initial?.zeroingRules ?? []).join("\n"));
  const set = <K extends keyof RubricFormValue>(k: K, value: RubricFormValue[K]) => setV((p) => ({ ...p, [k]: value }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const setCriterion = (i: number, patch: Partial<RubricFormValue["criteria"][number]>) => set("criteria", v.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <form
      className="flex max-w-3xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveRubricAction({ ...v, zeroingRules: zeroing.split("\n").map((z) => z.trim()).filter(Boolean) }));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Concurso" htmlFor="rb-comp" className="sm:col-span-2">
          <NativeSelect value={v.competitionId} onChange={(e) => set("competitionId", e.target.value)} disabled={!!v.id}>
            <option value="">Escolha</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Ano do edital" htmlFor="rb-year" optional>
          <Input inputMode="numeric" value={v.year ?? ""} onChange={(e) => set("year", num(e.target.value))} />
        </Field>
      </div>
      <Field label="Link do edital" htmlFor="rb-url" optional>
        <Input type="url" value={v.editalUrl} onChange={(e) => set("editalUrl", e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Tipo de texto" htmlFor="rb-type" hint="Como o edital descreve, por exemplo: dissertativo-argumentativo.">
        <Input value={v.textType} onChange={(e) => set("textType", e.target.value)} maxLength={200} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Mínimo de linhas" htmlFor="rb-min" optional>
          <Input inputMode="numeric" value={v.minLines ?? ""} onChange={(e) => set("minLines", num(e.target.value))} />
        </Field>
        <Field label="Máximo de linhas" htmlFor="rb-max" optional>
          <Input inputMode="numeric" value={v.maxLines ?? ""} onChange={(e) => set("maxLines", num(e.target.value))} />
        </Field>
        <Field label="Caracteres por linha (estimativa)" htmlFor="rb-cpl">
          <Input inputMode="numeric" value={v.charsPerLine} onChange={(e) => set("charsPerLine", Number(e.target.value) || 70)} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-fg-muted">Critérios, como estão no edital</legend>
        {v.criteria.map((c, i) => (
          <div key={i} className="grid gap-2 rounded-[var(--radius-object)] p-3 shadow-[inset_0_0_0_1px_var(--line)] sm:grid-cols-[8rem_minmax(0,1fr)_6rem_5rem_auto]">
            <Input aria-label="Chave" placeholder="chave" value={c.key} onChange={(e) => setCriterion(i, { key: e.target.value })} />
            <Input aria-label="Nome" placeholder="Nome do critério" value={c.name} onChange={(e) => setCriterion(i, { name: e.target.value })} />
            <Input aria-label="Nota máxima" inputMode="decimal" placeholder="Máx." value={c.maxScore || ""} onChange={(e) => setCriterion(i, { maxScore: num(e.target.value) ?? 0 })} />
            <Input aria-label="Peso" inputMode="decimal" placeholder="Peso" value={c.weight} onChange={(e) => setCriterion(i, { weight: num(e.target.value) ?? 1 })} />
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Remover critério" onClick={() => set("criteria", v.criteria.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
            <Textarea aria-label="Descrição" rows={2} placeholder="O que o edital avalia neste critério" className="sm:col-span-5" value={c.description} onChange={(e) => setCriterion(i, { description: e.target.value })} />
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => set("criteria", [...v.criteria, { ...emptyCriterion }])}>
          <Plus />
          Critério
        </Button>
      </fieldset>
      <Field label="Situações que zeram a redação" htmlFor="rb-zero" optional hint="Uma por linha, como no edital.">
        <Textarea rows={4} value={zeroing} onChange={(e) => setZeroing(e.target.value)} />
      </Field>
      <label className="flex items-center gap-3 text-base text-fg">
        <Switch checked={v.verified} onCheckedChange={(x) => set("verified", x)} />
        Conferi estes critérios no edital do ano informado
      </label>
      <Button type="submit" variant="primary" loading={pending} className="self-start">
        {v.id ? "Salvar rubrica" : "Criar rubrica"}
      </Button>
    </form>
  );
}

export function PublishRubricButton({ id, published }: { id: string; published: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant={published ? "ghost" : "secondary"} loading={pending} onClick={() => run(() => publishRubricAction(id, !published))}>
      {published ? "Despublicar" : "Publicar"}
    </Button>
  );
}

export function ThemeReviewButtons({ id, status }: { id: string; status: "DRAFT" | "PUBLISHED" | "REJECTED" }) {
  const { pending, run } = useRun();
  return (
    <div className="flex gap-2">
      {status !== "PUBLISHED" && (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => reviewThemeAction(id, { status: "PUBLISHED" }))}>
          Publicar
        </Button>
      )}
      {status !== "REJECTED" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => reviewThemeAction(id, { status: "REJECTED" }))}>
          Rejeitar
        </Button>
      )}
    </div>
  );
}

export function GenerateThemesForm({ competitions, aiReady }: { competitions: Option[]; aiReady: boolean }) {
  const { pending, run } = useRun();
  const [competitionId, setCompetitionId] = React.useState(competitions[0]?.id ?? "");
  const [count, setCount] = React.useState("4");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Concurso" htmlFor="gen-comp">
          <NativeSelect value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Quantidade" htmlFor="gen-count">
          <Input inputMode="numeric" className="w-24" value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <Button variant="secondary" loading={pending} disabled={!aiReady || !competitionId} onClick={() => run(() => generateThemesAction(competitionId, Number(count)))}>
          Gerar agora
        </Button>
        <Button variant="ghost" disabled={pending || !aiReady} onClick={() => run(() => submitThemeBatchAction(Number(count)))}>
          Gerar em lote para todos (metade do preço)
        </Button>
      </div>
      <p className="text-sm text-fg-subtle">Os temas entram como rascunho. Nenhum chega aos alunos sem publicação aqui.</p>
    </div>
  );
}

export function CollectBatchButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => collectThemeBatchAction(id))}>
      Buscar resultados
    </Button>
  );
}

export function OfficialThemeForm({ competitions }: { competitions: Option[] }) {
  const { pending, run } = useRun();
  const [competitionId, setCompetitionId] = React.useState(competitions[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [year, setYear] = React.useState("");
  const [support, setSupport] = React.useState([{ title: "", text: "", source: "" }]);
  return (
    <form
      className="flex max-w-3xl flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveOfficialThemeAction({ competitionId, title, prompt, year: Number(year), supportTexts: support.filter((s) => s.text.trim()) }),
          () => {
            setTitle("");
            setPrompt("");
            setSupport([{ title: "", text: "", source: "" }]);
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <Field label="Concurso" htmlFor="ot-comp">
          <NativeSelect value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Ano" htmlFor="ot-year">
          <Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
      </div>
      <Field label="Título" htmlFor="ot-title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Proposta (como na prova)" htmlFor="ot-prompt">
        <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      {support.map((s, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-2">
          <Input aria-label={`Título do texto ${i + 1}`} placeholder={`Texto ${i + 1}: título`} value={s.title} onChange={(e) => setSupport(support.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
          <Input aria-label={`Fonte do texto ${i + 1}`} placeholder="Fonte, como consta na prova" value={s.source} onChange={(e) => setSupport(support.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))} />
          <Textarea aria-label={`Texto ${i + 1}`} rows={3} className="sm:col-span-2" value={s.text} onChange={(e) => setSupport(support.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setSupport([...support, { title: "", text: "", source: "" }])}>
          <Plus />
          Texto de apoio
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          Cadastrar tema oficial
        </Button>
      </div>
    </form>
  );
}
