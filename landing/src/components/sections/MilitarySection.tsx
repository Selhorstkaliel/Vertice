import { motion } from "framer-motion";
import { BookOpenCheck, CalendarDays, Dumbbell, Flag, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import { tafDemo } from "@/data/demo";
import { militaryExamples } from "@/data/contests";
import { EASE, viewport } from "@/animations/motion";
import { Reveal } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { DashboardWindow } from "@/components/ui/DashboardWindow";
import { LineChart } from "@/components/ui/MetricChart";

const pillars = [
  { label: "Estudos", icon: BookOpenCheck },
  { label: "Simulados", icon: Timer },
  { label: "Calendário", icon: CalendarDays },
  { label: "Metas", icon: Flag },
  { label: "TAF", icon: Dumbbell },
];

export function MilitarySection() {
  const run = tafDemo[0]!;

  return (
    <Section id="militares" tone="raised" aria-labelledby="militares-title">
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:items-center lg:gap-12">
        <Reveal className="order-2 lg:order-1 lg:col-span-7">
          <DashboardWindow title="Área militar" path="/militar" bodyClassName="grid gap-4 p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-[14px] border border-line-soft bg-surface p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm text-fg-subtle">{run.name}</h3>
                  <span className="text-xs text-fg-subtle">últimos 5 treinos</span>
                </div>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="numeral text-3xl font-semibold tracking-[-0.03em]">{run.current.toLocaleString("pt-BR")}</span>
                  <span className="text-sm text-fg-subtle">m</span>
                </p>
                <LineChart
                  data={run.history.map((v, i) => ({ label: `T${i + 1}`, value: v }))}
                  min={2000}
                  max={2700}
                  target={{ value: run.goal, label: `Sua meta: ${run.goal.toLocaleString("pt-BR")} m` }}
                  format={(v) => v.toLocaleString("pt-BR")}
                  showValues={false}
                  targetLabelAt="left"
                  className="mt-5 h-32"
                  ariaLabel={`Corrida de 12 minutos: de ${run.history[0]} a ${run.current} metros, meta de ${run.goal}`}
                />
              </div>
              <ul className="grid gap-2">
                {tafDemo.slice(1).map((t) => {
                  const pct = Math.min(100, Math.round((t.current / t.goal) * 100));
                  return (
                    <li key={t.name} className="rounded-[12px] border border-line-soft bg-surface p-3.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-fg-muted">{t.name}</span>
                        <span className="numeral">
                          <span className="font-medium text-fg">{t.current}</span>
                          <span className="text-fg-subtle"> / {t.goal}</span>
                        </span>
                      </div>
                      <div className="mt-2.5 h-1.5 rounded-full bg-white/[0.07]" role="progressbar" aria-label={`${t.name}: ${pct}% da meta`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <motion.div
                          className="h-full origin-left rounded-full bg-positive"
                          style={{ width: `${pct}%` }}
                          initial={{ scaleX: 0 }}
                          whileInView={{ scaleX: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, ease: EASE }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="text-xs text-fg-subtle">Metas definidas pelo próprio estudante. Confira os índices exigidos no edital oficial.</p>
          </DashboardWindow>
        </Reveal>

        <Reveal delay={0.1} className="order-1 flex flex-col gap-6 lg:order-2 lg:col-span-5">
          <h2 id="militares-title" className="text-balance text-[2.125rem] leading-[1.06] font-semibold tracking-[-0.035em] sm:text-5xl lg:text-[3.25rem]">
            Preparação além da prova escrita.
          </h2>
          <p className="text-pretty text-base leading-relaxed text-fg-muted sm:text-lg">
            Concursos com etapas físicas pedem dois treinos ao mesmo tempo. A área militar reúne as etapas do seu concurso e o acompanhamento do TAF ao lado
            dos estudos, sem misturar os dois.
          </p>

          <motion.ul
            initial="hidden"
            whileInView="visible"
            viewport={viewport}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
            className="flex flex-wrap items-center gap-2"
            aria-label="Integrado na mesma preparação"
          >
            {pillars.map((p, i) => {
              const Icon = p.icon;
              const last = i === pillars.length - 1;
              return (
                <motion.li
                  key={p.label}
                  variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                    last ? "border-performance/40 bg-performance/10 text-fg" : "border-line bg-surface text-fg-muted",
                  )}
                >
                  <Icon aria-hidden className={cn("size-3.5", last && "text-performance")} />
                  {p.label}
                </motion.li>
              );
            })}
          </motion.ul>

          <div className="border-t border-line pt-6">
            <h3 className="text-sm font-medium text-fg">Exemplos de concursos com preparação militar</h3>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {militaryExamples.map((c) => (
                <li key={c} className="text-sm text-fg-subtle">
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
              Etapas, datas e requisitos aparecem só quando cadastrados e verificados no sistema. O que não foi verificado fica identificado.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
