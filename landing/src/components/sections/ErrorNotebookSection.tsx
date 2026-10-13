import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Repeat } from "lucide-react";
import { cn } from "@/lib/cn";
import { errorEntries, errorReasons } from "@/data/demo";
import { EASE } from "@/animations/motion";
import { Reveal } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { Muted, SectionHeader } from "@/components/ui/SectionHeader";
import { DashboardWindow } from "@/components/ui/DashboardWindow";
import { Badge } from "@/components/ui/Badge";

const recurrence = [
  { label: "Sem. 1", value: 12 },
  { label: "Sem. 2", value: 10 },
  { label: "Sem. 3", value: 9 },
  { label: "Sem. 4", value: 7 },
  { label: "Sem. 5", value: 6 },
];

export function ErrorNotebookSection() {
  const [selected, setSelected] = useState(errorEntries[0]!.id);
  const entry = errorEntries.find((e) => e.id === selected) ?? errorEntries[0]!;
  const maxReason = Math.max(...errorReasons.map((r) => r.value));
  const maxRec = Math.max(...recurrence.map((r) => r.value));

  return (
    <Section aria-labelledby="erros-title">
      <SectionHeader
        id="erros-title"
        title={
          <>
            Errar uma vez é dado. <Muted>Errar sempre é padrão.</Muted>
          </>
        }
        description="Cada erro fica registrado com o motivo. Quando o mesmo tipo de erro volta, ele deixa de ser acaso e entra no plano como revisão."
      />

      <Reveal delay={0.1} className="mt-12 lg:mt-16">
        <DashboardWindow title="Caderno de erros" path="/caderno-de-erros" bodyClassName="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h3 className="sr-only">Erros registrados</h3>
            <ul className="flex flex-col gap-2">
              {errorEntries.map((e) => {
                const on = e.id === selected;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelected(e.id)}
                      className={cn(
                        "flex w-full flex-col gap-1.5 rounded-[12px] border p-3.5 text-left transition-colors duration-200",
                        on ? "border-line-strong bg-elevated" : "border-line-soft bg-surface hover:border-line",
                      )}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-xs text-fg-subtle">{e.subject}</span>
                        <span className={cn("numeral flex items-center gap-1 text-xs", e.repeats >= 3 ? "text-danger" : "text-fg-subtle")}>
                          <Repeat aria-hidden className="size-3" />
                          {e.repeats}×
                        </span>
                      </span>
                      <span className="text-sm font-medium text-fg">{e.topic}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-7">
            <div className="min-h-[248px] rounded-[14px] border border-line-soft bg-surface p-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="flex flex-col gap-4"
                >
                  <p className="text-[0.9375rem] leading-relaxed text-fg-muted">“{entry.excerpt}”</p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-soft pt-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-fg-subtle">Matéria</dt>
                      <dd className="text-fg">{entry.subject}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-fg-subtle">Assunto</dt>
                      <dd className="text-fg">{entry.topic.split(" — ")[1] ?? entry.topic}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Tipo de erro</dt>
                      <dd className="text-fg">{entry.reason}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Último erro</dt>
                      <dd className="numeral text-fg">{entry.date}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-subtle">Reincidências</dt>
                      <dd className={cn("numeral", entry.repeats >= 3 ? "text-danger" : "text-fg")}>{entry.repeats} vezes</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line-soft bg-canvas-2 px-3.5 py-3">
                    <span className="flex items-center gap-2 text-sm text-fg">
                      <CalendarClock aria-hidden className="size-4 text-fg-subtle" />
                      Revisão recomendada
                    </span>
                    <Badge tone={entry.urgent ? "performance" : "neutral"}>{entry.review}</Badge>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-[14px] border border-line-soft bg-surface p-4">
                <h3 className="text-xs text-fg-subtle">Motivos mais frequentes</h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {errorReasons.map((r) => (
                    <li key={r.label} className="grid grid-cols-[88px_1fr_24px] items-center gap-2 text-xs">
                      <span className="text-fg-muted">{r.label}</span>
                      <span className="h-1.5 rounded-full bg-white/[0.06]">
                        <span className="block h-full rounded-full bg-fg-subtle" style={{ width: `${(r.value / maxReason) * 100}%` }} />
                      </span>
                      <span className="numeral text-right text-fg">{r.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[14px] border border-line-soft bg-surface p-4">
                <h3 className="text-xs text-fg-subtle">Erros reincidentes por semana</h3>
                <div
                  className="mt-3 flex h-[104px] items-end gap-2"
                  role="img"
                  aria-label={`Erros reincidentes por semana: ${recurrence.map((r) => r.value).join(", ")}`}
                >
                  {recurrence.map((r) => (
                    <div key={r.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" aria-hidden>
                      <span className="numeral text-[0.625rem] text-fg-subtle">{r.value}</span>
                      <span className="w-full rounded-[3px] bg-danger/60" style={{ height: `${(r.value / maxRec) * 70}%` }} />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-fg-subtle">Queda de 12 para 6 em cinco semanas.</p>
              </div>
            </div>
          </div>
        </DashboardWindow>
      </Reveal>
    </Section>
  );
}
