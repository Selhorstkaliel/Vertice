import { Minus, Plus } from "lucide-react";
import type { ReadinessResult } from "@/engines/performance/readiness";
import { cn } from "@/lib/utils";

const MILESTONES = [50, 70, 85];

/** Readiness scale; gold is reserved for milestones actually reached. */
export function ReadinessScale({ value }: { value: number }) {
  return (
    <div className="relative h-5" role="img" aria-label={`Índice ${value} de 100`}>
      <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line-soft" />
      <span className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-fg-muted" style={{ width: `${value}%` }} />
      {MILESTONES.map((m) => (
        <span
          key={m}
          aria-hidden="true"
          className={cn("absolute top-0 h-5 w-px", value >= m ? "bg-gold" : "bg-line")}
          style={{ left: `${m}%` }}
        />
      ))}
    </div>
  );
}

export function ReadinessComponents({ readiness }: { readiness: ReadinessResult }) {
  return (
    <dl className="flex flex-col">
      {readiness.components.map((c) => (
        <div key={c.key} className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2.5 last:border-b-0">
          <dt className="flex flex-col">
            <span className="text-base text-fg">
              {c.label} <span className="text-sm text-fg-subtle">— peso {Math.round(c.weight * 100)}%</span>
            </span>
            <span className="text-sm text-fg-subtle">{c.note}</span>
          </dt>
          <dd className="numeral text-base text-fg">
            {c.value === null ? (
              <span className="text-fg-subtle">Sem dados</span>
            ) : (
              <>
                {Math.round(c.value * 100)}
                <span className="text-sm text-fg-subtle">/100</span>
              </>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ReadinessSummary({ readiness, competitionName, detailed = false }: { readiness: ReadinessResult; competitionName: string; detailed?: boolean }) {
  if (readiness.value === null) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2">
          <span className="numeral text-2xl font-light text-fg-subtle">—</span>
          <span className="text-base text-fg-subtle">/100</span>
        </p>
        <p className="text-base text-fg-muted">{readiness.insufficientReason}</p>
      </div>
    );
  }
  const milestone = [...MILESTONES].reverse().find((m) => readiness.value! >= m);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <p className="flex items-baseline gap-1.5">
          <span className="numeral text-[2.75rem] leading-none font-light text-fg">{readiness.value}</span>
          <span className="text-md text-fg-subtle">/100</span>
        </p>
        {milestone && <span className="text-sm text-gold">Marco de {milestone} atingido</span>}
      </div>
      <ReadinessScale value={readiness.value} />
      <p className="text-sm text-fg-subtle">
        Índice de Preparação para {competitionName}. Resume a evidência de preparação; não é chance de aprovação.
      </p>
      {(readiness.strengths.length > 0 || readiness.gaps.length > 0) && (
        <ul className="flex flex-col gap-1.5">
          {readiness.strengths.map((s) => (
            <li key={s} className="flex items-start gap-2 text-base text-fg-muted">
              <Plus className="mt-1 size-3.5 shrink-0 text-positive" aria-label="Ponto forte" />
              {s}
            </li>
          ))}
          {readiness.gaps.map((g) => (
            <li key={g} className="flex items-start gap-2 text-base text-fg-muted">
              <Minus className="mt-1 size-3.5 shrink-0 text-danger" aria-label="Ponto a melhorar" />
              {g}
            </li>
          ))}
        </ul>
      )}
      {detailed && <ReadinessComponents readiness={readiness} />}
    </div>
  );
}
