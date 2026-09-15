"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/display";
import { Field, NativeSelect } from "@/components/ui/input";
import { DIFFICULTY_LABEL } from "@/lib/labels";
import { generateQuestionsAction } from "@/modules/exam-papers/actions";

interface CompetitionOption {
  id: string;
  name: string;
  officialCount: number;
  subjects: { id: string; name: string; officialCount: number; topics: { id: string; name: string }[] }[];
}

export function GenerateForm({ competitions, aiReady }: { competitions: CompetitionOption[]; aiReady: boolean }) {
  const router = useRouter();
  const ready = competitions.filter((c) => c.officialCount > 0);
  const [competitionId, setCompetitionId] = React.useState(ready[0]?.id ?? "");
  const competition = ready.find((c) => c.id === competitionId);
  const subjects = competition?.subjects.filter((s) => s.officialCount > 0) ?? [];
  const [subjectId, setSubjectId] = React.useState(subjects[0]?.id ?? "");
  const subject = subjects.find((s) => s.id === subjectId);
  const [topicId, setTopicId] = React.useState("");
  const [count, setCount] = React.useState("5");
  const [difficulty, setDifficulty] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (ready.length === 0) {
    return (
      <Notice tone="neutral" title="Ainda não há questões oficiais publicadas">
        As questões geradas seguem o estilo das provas reais. Publique questões de uma prova importada para liberar a geração daquele concurso.
      </Notice>
    );
  }

  const submit = () => {
    setMessage(null);
    startTransition(async () => {
      const r = await generateQuestionsAction({ competitionId, subjectId, topicId: topicId || null, count: Number(count), difficulty: (difficulty || null) as "EASY" | "MEDIUM" | "HARD" | null });
      if (!r.ok) {
        setMessage(r.error);
        return;
      }
      toast.success(r.message);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {message && <Notice tone="danger">{message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Concurso" htmlFor="gerar-concurso">
          <NativeSelect
            value={competitionId}
            onChange={(e) => {
              setCompetitionId(e.target.value);
              const next = ready.find((c) => c.id === e.target.value)?.subjects.find((s) => s.officialCount > 0);
              setSubjectId(next?.id ?? "");
              setTopicId("");
            }}
          >
            {ready.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.officialCount} oficiais)
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Disciplina" htmlFor="gerar-disciplina">
          <NativeSelect
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTopicId("");
            }}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.officialCount})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Tópico" htmlFor="gerar-topico" optional>
          <NativeSelect value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">Qualquer tópico</option>
            {subject?.topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Quantidade" htmlFor="gerar-quantidade">
          <NativeSelect value={count} onChange={(e) => setCount(e.target.value)}>
            {[1, 3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Dificuldade" htmlFor="gerar-dificuldade" optional>
          <NativeSelect value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="">Como nas provas</option>
            {(Object.keys(DIFFICULTY_LABEL) as (keyof typeof DIFFICULTY_LABEL)[]).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={submit} loading={pending} disabled={!aiReady || !subjectId}>
          <Sparkles /> Gerar questões
        </Button>
        <p className="text-sm text-fg-subtle">{pending ? "Gerando e verificando cada questão. Pode levar 1 a 2 minutos." : "Cada questão é resolvida de novo por uma verificação independente antes de chegar aqui."}</p>
      </div>
    </div>
  );
}
