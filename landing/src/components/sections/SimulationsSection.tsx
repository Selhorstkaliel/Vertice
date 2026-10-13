import { motion } from "framer-motion";
import { Clock3, ListChecks, Trophy } from "lucide-react";
import { formatMinutes } from "@/lib/format";
import { simulationDemo as sim } from "@/data/demo";
import { EASE } from "@/animations/motion";
import { Reveal } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { DashboardWindow } from "@/components/ui/DashboardWindow";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { LineChart } from "@/components/ui/MetricChart";
import { Badge } from "@/components/ui/Badge";

const formats = [
  { title: "Completo", body: "Todas as disciplinas do edital, na proporção da prova." },
  { title: "Personalizado", body: "As matérias, a quantidade de questões e o tempo que você escolher." },
  { title: "Com tempo de prova", body: "Cronômetro correndo, como no dia da prova." },
];

export function SimulationsSection() {
  const pct = (sim.correct / sim.questions) * 100;
  const timePct = (sim.usedMinutes / sim.limitMinutes) * 100;
  const pctLabel = pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const best = Math.max(...sim.history.map((h) => h.value));

  return (
    <Section id="simulados" tone="raised" aria-labelledby="simulados-title">
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:items-center lg:gap-12">
        <Reveal className="flex flex-col gap-6 lg:col-span-4">
          <h2 id="simulados-title" className="text-balance text-[2.125rem] leading-[1.06] font-semibold tracking-[-0.035em] sm:text-5xl lg:text-[3.25rem]">
            Treine como será cobrado.
          </h2>
          <p className="text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">
            Simulados com tempo, correção e comparação com os seus próprios resultados anteriores.
          </p>
          <dl className="mt-2 flex flex-col border-t border-line">
            {formats.map((f) => (
              <div key={f.title} className="flex flex-col gap-1 border-b border-line-soft py-4">
                <dt className="text-sm font-medium text-fg">{f.title}</dt>
                <dd className="text-sm text-fg-subtle">{f.body}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal delay={0.12} className="lg:col-span-8">
          <DashboardWindow title="Resultado do simulado" path="/simulados" bodyClassName="grid gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-fg-subtle">{sim.kind}</p>
                <h3 className="text-lg font-semibold tracking-[-0.02em] text-fg sm:text-xl">{sim.title}</h3>
              </div>
              <Badge tone="positive" icon={<Trophy className="size-3.5" aria-hidden />}>
                Melhor resultado entre seus {sim.history.length} simulados
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="flex flex-col gap-5 rounded-[14px] border border-line-soft bg-surface p-5 md:col-span-2">
                <div className="flex items-center gap-5">
                  <svg viewBox="0 0 80 80" className="size-24 shrink-0 -rotate-90" role="img" aria-label={`${pctLabel}% de acertos`}>
                    <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-line)" strokeWidth="6" />
                    <motion.circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke="var(--color-info)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      whileInView={{ pathLength: pct / 100 }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.3, ease: EASE }}
                    />
                  </svg>
                  <div>
                    <p className="numeral text-3xl font-semibold tracking-[-0.03em]">{pctLabel}%</p>
                    <p className="text-sm text-fg-subtle">de acertos</p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 border-t border-line-soft pt-4 text-sm">
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-fg-subtle">
                      <ListChecks aria-hidden className="size-3.5" />
                      Pontuação
                    </dt>
                    <dd className="numeral mt-0.5 text-fg">
                      {sim.correct} de {sim.questions}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-xs text-fg-subtle">
                      <Clock3 aria-hidden className="size-3.5" />
                      Tempo
                    </dt>
                    <dd className="numeral mt-0.5 text-fg">
                      {formatMinutes(sim.usedMinutes)} <span className="text-fg-subtle">de {formatMinutes(sim.limitMinutes)}</span>
                    </dd>
                  </div>
                </dl>
                <ProgressBar value={timePct} tone="neutral" label="Tempo utilizado" />
              </div>

              <div className="flex flex-col gap-4 md:col-span-3">
                <div className="rounded-[14px] border border-line-soft bg-surface p-4">
                  <h4 className="text-xs text-fg-subtle">Por disciplina</h4>
                  <ul className="mt-3 flex flex-col gap-3">
                    {sim.bySubject.map((s) => {
                      const p = Math.round((s.correct / s.total) * 100);
                      return (
                        <li key={s.name} className="grid gap-1.5">
                          <span className="flex justify-between text-sm">
                            <span className="text-fg">{s.name}</span>
                            <span className="numeral text-fg-muted">
                              {s.correct}/{s.total} · {p}%
                            </span>
                          </span>
                          <ProgressBar value={p} target={70} tone={p < 70 ? "warning" : "info"} label={`${s.name}: ${p}% de acertos`} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="rounded-[14px] border border-line-soft bg-surface p-4">
                  <h4 className="text-xs text-fg-subtle">Sua evolução nos simulados</h4>
                  <LineChart
                    data={sim.history}
                    min={50}
                    max={80}
                    format={(v) => `${v.toLocaleString("pt-BR")}%`}
                    className="mt-6 h-28"
                    ariaLabel={`Evolução nos simulados: ${sim.history.map((h) => `${h.value}%`).join(", ")}. Melhor resultado: ${best}%.`}
                  />
                </div>
              </div>
            </div>
          </DashboardWindow>
        </Reveal>
      </div>
    </Section>
  );
}
