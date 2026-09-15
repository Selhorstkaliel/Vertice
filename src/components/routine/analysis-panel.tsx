import { formatMinutes, formatPercent, weekdayName } from "@/lib/format";
import { SLOT_CLASS_HINT, SLOT_CLASS_LABEL } from "@/lib/labels";
import { OVERLOAD_LABEL, SUSTAINABILITY_LABEL, type RoutineAnalysis } from "@/engines/routine/analyzer";
import type { Diagnostic } from "@/engines/types";
import { Metric } from "@/components/ui/display";
import { cn } from "@/lib/utils";

const SEVERITY: Record<Diagnostic["severity"], { label: string; rail: string; text: string }> = {
  critical: { label: "Crítico", rail: "bg-danger", text: "text-danger" },
  warning: { label: "Atenção", rail: "bg-warning", text: "text-warning" },
  info: { label: "Observação", rail: "bg-fg-faint", text: "text-fg-subtle" },
};

export function DiagnosticList({ diagnostics, empty }: { diagnostics: Diagnostic[]; empty?: string }) {
  if (diagnostics.length === 0) {
    return <p className="text-base text-fg-muted">{empty ?? "Nenhum problema detectado."}</p>;
  }
  return (
    <ul className="flex flex-col">
      {diagnostics.map((d, i) => {
        const s = SEVERITY[d.severity];
        return (
          <li key={`${d.code}-${i}`} className="relative border-b border-line-soft py-4 pl-4 last:border-b-0">
            <span aria-hidden="true" className={cn("absolute top-4 bottom-4 left-0 w-0.5 rounded-full", s.rail)} />
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className={cn("text-sm font-medium", s.text)}>{s.label}</span>
              <span className="text-base font-medium text-fg">{d.title}</span>
            </div>
            <p className="mt-1 text-base text-fg-muted">{d.detail}</p>
            {d.suggestion && <p className="mt-1.5 text-base text-fg">{d.suggestion}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function SustainabilityReadout({ analysis, className, omitPlanned = false }: { analysis: RoutineAnalysis; className?: string; omitPlanned?: boolean }) {
  const sustainabilityTone = { GOOD: "text-positive", MODERATE: "text-warning", LOW: "text-danger" }[analysis.sustainability];
  const riskTone = { LOW: "text-positive", MODERATE: "text-warning", HIGH: "text-danger" }[analysis.overloadRisk];
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3", className)}>
      {!omitPlanned && analysis.plannedBasis !== "recommended" && (
        <Metric
          label={analysis.plannedBasis === "plan" ? "Carga planejada" : "Meta semanal"}
          value={formatMinutes(analysis.plannedMinutes)}
          detail={analysis.plannedBasis === "target" ? "Sem plano gerado nesta semana" : undefined}
          size="sm"
        />
      )}
      <Metric label="Carga recomendada" value={formatMinutes(analysis.recommendedMinutes)} size="sm" />
      <Metric
        label="Consistência"
        value={analysis.consistency === null ? "—" : formatPercent(analysis.consistency)}
        detail={analysis.consistency === null ? "Após a primeira semana de plano" : "Últimas semanas"}
        size="sm"
      />
      <Metric label="Sustentabilidade" value={SUSTAINABILITY_LABEL[analysis.sustainability]} valueClassName={sustainabilityTone} size="sm" />
      <Metric label="Risco de sobrecarga" value={OVERLOAD_LABEL[analysis.overloadRisk]} valueClassName={riskTone} size="sm" />
      <Metric label="Tempo livre na rotina" value={formatMinutes(analysis.capacityMinutes)} size="sm" />
    </dl>
  );
}

export function AnalysisPanel({ analysis }: { analysis: RoutineAnalysis }) {
  const total = analysis.classMinutes.A + analysis.classMinutes.B + analysis.classMinutes.C;
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="sust-title" className="flex flex-col gap-4">
        <h2 id="sust-title" className="text-md font-semibold">
          Índice de sustentabilidade
        </h2>
        <SustainabilityReadout analysis={analysis} />
        <details className="group text-sm text-fg-subtle">
          <summary className="cursor-pointer select-none hover:text-fg">Como a carga recomendada é calculada</summary>
          <p className="mt-2">
            Menor valor entre: {analysis.recommendedBasis.join("; ")}. Esta análise organiza sua rotina e não é uma avaliação de saúde.
          </p>
        </details>
      </section>

      <section aria-labelledby="class-title" className="flex flex-col gap-4">
        <h2 id="class-title" className="text-md font-semibold">
          Classificação dos horários livres
        </h2>
        {total === 0 ? (
          <p className="text-base text-fg-muted">Sem horários livres na rotina.</p>
        ) : (
          <>
            <div className="flex h-2 overflow-hidden rounded-full" aria-hidden="true">
              <span className="bg-performance" style={{ width: `${(analysis.classMinutes.A / total) * 100}%` }} />
              <span className="bg-info" style={{ width: `${(analysis.classMinutes.B / total) * 100}%` }} />
              <span className="bg-fg-faint" style={{ width: `${(analysis.classMinutes.C / total) * 100}%` }} />
            </div>
            <dl className="flex flex-col">
              {(["A", "B", "C"] as const).map((c) => (
                <div key={c} className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2.5 last:border-b-0">
                  <dt className="flex flex-col">
                    <span className="text-base text-fg">
                      {c} — {SLOT_CLASS_LABEL[c]}
                    </span>
                    <span className="text-sm text-fg-subtle">{SLOT_CLASS_HINT[c]}</span>
                  </dt>
                  <dd className="numeral text-base text-fg">{formatMinutes(analysis.classMinutes[c])}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </section>

      <section aria-labelledby="diag-title" className="flex flex-col gap-2">
        <h2 id="diag-title" className="text-md font-semibold">
          Análise da rotina
        </h2>
        <DiagnosticList diagnostics={analysis.diagnostics} empty="Nenhum problema detectado na rotina." />
      </section>

      <section aria-labelledby="days-title" className="flex flex-col gap-3">
        <h2 id="days-title" className="text-md font-semibold">
          Tempo livre por dia
        </h2>
        <dl className="grid grid-cols-7 gap-1.5">
          {analysis.capacityByDay.map((m, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="flex h-20 w-full items-end overflow-hidden rounded-[4px] bg-line-soft">
                <span className="w-full bg-fg-faint" style={{ height: `${Math.min(100, (m / 960) * 100)}%` }} />
              </div>
              <dt className="text-2xs text-fg-subtle">{weekdayName(i + 1, true)}</dt>
              <dd className="numeral text-2xs text-fg-muted">{formatMinutes(m)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
