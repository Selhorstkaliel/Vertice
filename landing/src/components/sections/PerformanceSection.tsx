import { SECTIONS } from "@/lib/routes";
import { performanceHighlights, weeklyAccuracy } from "@/data/demo";
import { Reveal, RevealGroup, RevealItem } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { Muted, SectionHeader } from "@/components/ui/SectionHeader";
import { DemoTag } from "@/components/ui/Badge";
import { LineChart } from "@/components/ui/MetricChart";
import { MetricCard } from "@/components/ui/MetricCard";

export function PerformanceSection() {
  const first = weeklyAccuracy[0]!;
  const last = weeklyAccuracy.at(-1)!;

  return (
    <Section id={SECTIONS.performance} aria-labelledby="desempenho-title">
      <SectionHeader
        id="desempenho-title"
        layout="stacked"
        title={
          <>
            Você não precisa sentir que está evoluindo. <Muted>Você precisa enxergar.</Muted>
          </>
        }
      />

      <Reveal delay={0.1} className="mt-12 rounded-[var(--radius-window)] border border-line bg-canvas-2 p-5 sm:p-8 lg:mt-16 lg:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-sm text-fg-subtle">Taxa de acertos por semana</h3>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="numeral text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{last.value}%</span>
              <span className="numeral text-sm text-positive">
                +{last.value - first.value} p.p. desde a {first.label.toLowerCase()}
              </span>
            </p>
          </div>
          <DemoTag label="Demonstração visual" />
        </div>

        <LineChart
          data={weeklyAccuracy}
          min={45}
          max={90}
          target={{ value: 70, label: "Meta de 70%" }}
          className="mt-10 h-64 sm:h-80"
          ariaLabel={`Taxa de acertos por semana: ${weeklyAccuracy.map((w) => `${w.label}, ${w.value}%`).join("; ")}`}
        />
      </Reveal>

      <RevealGroup gap={0.08} className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-4">
        {performanceHighlights.map((h) => (
          <RevealItem key={h.label}>
            <MetricCard
              label={h.label}
              value={h.value}
              prefix={h.prefix}
              suffix={h.suffix}
              hint={h.hint}
              countUp
              size="lg"
              className="h-full bg-canvas-2 p-5 sm:p-6"
            />
          </RevealItem>
        ))}
      </RevealGroup>
    </Section>
  );
}
