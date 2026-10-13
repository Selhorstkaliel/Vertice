import { Fragment, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMinutes } from "@/lib/format";
import { buildDemoPlan, slotMinutes } from "@/lib/plan";
import { availability } from "@/data/demo";
import { EASE, fadeUp, stagger, viewport } from "@/animations/motion";
import { Reveal } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DashboardWindow } from "@/components/ui/DashboardWindow";

const cycle = ["Rotina", "Plano", "Execução", "Desempenho", "Replanejamento"];

const kindTone: Record<string, string> = {
  Teoria: "bg-info",
  Questões: "bg-positive",
  Flashcards: "bg-warning",
};

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-200",
        checked ? "border-performance bg-performance" : "border-line-strong bg-canvas",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
        className={cn("size-4 rounded-full", checked ? "ml-[20px] bg-white" : "ml-[3px] bg-fg-subtle")}
      />
    </button>
  );
}

export function RoutineSection() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(availability.map((d) => [d.id, Boolean(d.from)])),
  );

  const plan = useMemo(() => buildDemoPlan(availability, enabled), [enabled]);
  const available = availability.reduce((sum, d) => sum + (enabled[d.id] ? slotMinutes(d) : 0), 0);
  const planned = plan.reduce((sum, p) => sum + p.blocks.reduce((s, b) => s + b.minutes, 0), 0);
  const blockCount = plan.reduce((sum, p) => sum + p.blocks.length, 0);

  return (
    <Section aria-labelledby="rotina-title">
      <SectionHeader
        id="rotina-title"
        title="Seu plano precisa caber na sua vida."
        description="Você informa quando pode estudar. O VÉRTICE transforma esse tempo em blocos — e refaz a conta quando a semana muda."
      />

      <Reveal delay={0.1} className="mt-12 lg:mt-16">
        <DashboardWindow title="Rotina e plano" path="/rotina" bodyClassName="grid grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium text-fg">Disponibilidade</h3>
              <span className="text-xs text-fg-subtle">Experimente ligar e desligar os dias</span>
            </div>
            <ul className="flex flex-col rounded-[14px] border border-line-soft bg-surface">
              {availability.map((day) => {
                const hasSlot = Boolean(day.from);
                const on = Boolean(enabled[day.id]);
                return (
                  <li key={day.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0">
                    <span className={cn("w-20 text-sm", on ? "text-fg" : "text-fg-subtle")}>{day.day}</span>
                    <span className={cn("numeral flex-1 text-sm", on ? "text-fg-muted" : "text-fg-faint")}>
                      {hasSlot ? (on ? `${day.from}–${day.to}` : "Sem disponibilidade") : "Sem disponibilidade"}
                    </span>
                    {hasSlot ? (
                      <Switch
                        checked={on}
                        onChange={() => setEnabled((e) => ({ ...e, [day.id]: !e[day.id] }))}
                        label={`Disponibilidade na ${day.day.toLowerCase()}, ${day.from} às ${day.to}`}
                      />
                    ) : (
                      <span className="w-10 text-center text-xs text-fg-faint" aria-hidden>
                        —
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex min-w-0 flex-col lg:col-span-7">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium text-fg">Plano gerado</h3>
              <p aria-live="polite" className="numeral text-xs text-fg-subtle">
                {formatMinutes(available)} disponíveis · {blockCount} blocos · {formatMinutes(planned)} de estudo
              </p>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-2 rounded-[14px] border border-line-soft bg-surface p-3 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {plan
                  .filter((p) => p.blocks.length)
                  .map(({ day, blocks }) => (
                    <motion.div
                      key={day.id}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="rounded-[10px] border border-line-soft bg-canvas-2 p-3"
                    >
                      <p className="mb-2 text-xs font-medium text-fg-muted">{day.day}</p>
                      <ul className="flex flex-col gap-1.5">
                        {blocks.map((b) => (
                          <li key={b.start} className="flex items-center gap-2.5 text-xs">
                            <span className="numeral w-[74px] shrink-0 text-fg-subtle">
                              {b.start}–{b.end}
                            </span>
                            <span aria-hidden className={cn("h-3.5 w-0.5 shrink-0 rounded-full", kindTone[b.kind])} />
                            <span className="truncate text-fg">{b.subject}</span>
                            <span className="ml-auto shrink-0 text-fg-subtle">{b.kind}</span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ))}
              </AnimatePresence>
              {blockCount === 0 && (
                <p className="col-span-full grid place-items-center py-10 text-center text-sm text-fg-subtle">
                  Sem horários disponíveis, não há plano. Ligue ao menos um dia.
                </p>
              )}
            </div>
            <p className="mt-3 text-xs text-fg-subtle">Ilustração simplificada. No app, o plano também considera edital, desempenho e revisões.</p>
          </div>
        </DashboardWindow>
      </Reveal>

      <motion.ol
        initial="hidden"
        whileInView="visible"
        viewport={viewport}
        variants={stagger(0.1)}
        aria-label="Ciclo do planejamento"
        className="mt-12 flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center lg:mt-16"
      >
        {cycle.map((step, i) => (
          <Fragment key={step}>
            <motion.li
              variants={fadeUp}
              className={cn(
                "flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm",
                i === cycle.length - 1 ? "border-performance/40 bg-performance/10 text-fg" : "border-line bg-surface text-fg-muted",
              )}
            >
              {i === cycle.length - 1 && <RefreshCw aria-hidden className="size-3.5 text-performance" />}
              {step}
            </motion.li>
            {i < cycle.length - 1 && (
              <motion.li variants={fadeUp} aria-hidden className="flex justify-center text-fg-faint">
                <ArrowRight className="size-4 rotate-90 sm:rotate-0" />
              </motion.li>
            )}
          </Fragment>
        ))}
      </motion.ol>
    </Section>
  );
}
