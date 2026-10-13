import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CornerDownRight, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMinutes } from "@/lib/format";
import { mentorDemo } from "@/data/demo";
import { EASE } from "@/animations/motion";
import { Reveal } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { DashboardWindow } from "@/components/ui/DashboardWindow";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { Sparkline } from "@/components/ui/MetricChart";
import { LogoMark } from "@/components/ui/Logo";

type View = "analysis" | "adjustment";

const principles = [
  { title: "Mostra o raciocínio", body: "Cada orientação cita os dados que a sustentam." },
  { title: "Você decide", body: "Nenhuma sugestão muda o plano sem sua confirmação." },
  { title: "Reversível", body: "Um ajuste aceito pode ser desfeito." },
];

export function MentorSection() {
  const [view, setView] = useState<View>("analysis");
  const [applied, setApplied] = useState(false);

  return (
    <Section tone="raised" aria-labelledby="mentor-title" className="overflow-hidden">
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:items-center lg:gap-12">
        <Reveal className="flex flex-col gap-6 lg:col-span-5">
          <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
            <LogoMark className="size-4" />
            Mentor Vértice
          </p>
          <h2 id="mentor-title" className="text-balance text-[2.125rem] leading-[1.06] font-semibold tracking-[-0.035em] sm:text-5xl lg:text-[3.25rem]">
            Seus dados precisam dizer alguma coisa.
          </h2>
          <p className="max-w-lg text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">
            O Mentor Vértice analisa informações da preparação e transforma desempenho, rotina e progresso em orientação prática.
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-5 border-t border-line pt-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {principles.map((p) => (
              <div key={p.title} className="flex flex-col gap-1">
                <dt className="text-sm font-medium text-fg">{p.title}</dt>
                <dd className="text-sm leading-relaxed text-fg-subtle">{p.body}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-relaxed text-fg-subtle">
            As recomendações auxiliam na organização da preparação e não garantem resultados em concursos.
          </p>
        </Reveal>

        <Reveal delay={0.15} className="lg:col-span-7">
          <DashboardWindow title="Mentor" path="/mentor" bodyClassName="flex flex-col gap-4 p-4 sm:p-6">
            <SegmentedControl<View>
              label="Visualização do Mentor"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "analysis", label: "Análise" },
                { value: "adjustment", label: "Ajuste proposto" },
              ]}
              className="self-start"
            />

            <div className="min-h-[360px] sm:min-h-[330px]">
              <AnimatePresence mode="wait" initial={false}>
                {view === "analysis" ? (
                  <motion.div
                    key="analysis"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-canvas">
                        <LogoMark className="size-4 text-fg" />
                      </span>
                      <div className="rounded-[14px] rounded-tl-[4px] border border-line bg-elevated p-4">
                        <p className="text-[0.9375rem] leading-relaxed text-fg sm:text-base">{mentorDemo.message}</p>
                      </div>
                    </div>

                    <div className="ml-11 flex flex-col gap-2">
                      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
                        <CornerDownRight aria-hidden className="size-3.5" />
                        Baseado em
                      </p>
                      <ul className="grid gap-2">
                        {mentorDemo.evidence.map((e) => (
                          <li key={e.label} className="flex items-center justify-between gap-3 rounded-[10px] border border-line-soft bg-surface px-3 py-2.5">
                            <span className="text-sm text-fg-muted">{e.label}</span>
                            <span className="flex items-center gap-3">
                              {e.values.length > 0 && <Sparkline values={e.values} tone={e.tone === "danger" ? "danger" : "positive"} className="h-5 w-12" />}
                              <span
                                className={cn(
                                  "numeral text-sm font-medium",
                                  e.tone === "danger" ? "text-danger" : e.tone === "positive" ? "text-positive" : "text-fg",
                                )}
                              >
                                {e.summary}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                      <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={() => setView("adjustment")}>
                        Ver ajuste proposto
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="adjustment"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex flex-col gap-4"
                  >
                    <p className="text-sm text-fg-muted">Próximo bloco de estudo, redistribuído entre as duas matérias. O tempo total não muda.</p>
                    <ul className="grid gap-3">
                      {mentorDemo.adjustment.map((a) => {
                        const up = a.after > a.before;
                        return (
                          <li key={a.subject} className="rounded-[12px] border border-line-soft bg-surface p-4">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-fg">{a.subject}</span>
                              <span className="numeral flex items-center gap-2">
                                <span className="text-fg-subtle line-through decoration-fg-faint">{formatMinutes(a.before)}</span>
                                <span className={cn("font-medium", up ? "text-positive" : "text-fg")}>{formatMinutes(a.after)}</span>
                              </span>
                            </div>
                            <div className="relative mt-3 h-1.5 rounded-full bg-white/[0.07]">
                              <span className="absolute inset-y-0 left-0 rounded-full bg-fg-faint/50" style={{ width: `${(a.before / 150) * 100}%` }} />
                              <motion.span
                                className={cn("absolute inset-y-0 left-0 rounded-full", up ? "bg-positive" : "bg-info")}
                                initial={{ width: `${(a.before / 150) * 100}%` }}
                                animate={{ width: `${((applied ? a.after : a.before) / 150) * 100}%` }}
                                transition={{ duration: 0.6, ease: EASE }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <div aria-live="polite" className="flex min-h-11 flex-wrap items-center gap-3">
                      {applied ? (
                        <>
                          <span className="flex items-center gap-2 text-sm text-positive">
                            <Check aria-hidden className="size-4" />
                            Ajuste aplicado nesta demonstração
                          </span>
                          <Button variant="ghost" size="sm" onClick={() => setApplied(false)}>
                            <Undo2 aria-hidden className="size-4" />
                            Desfazer
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => setApplied(true)}>
                            Aceitar ajuste
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setView("analysis")}>
                            Voltar para a análise
                          </Button>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </DashboardWindow>
        </Reveal>
      </div>
    </Section>
  );
}
