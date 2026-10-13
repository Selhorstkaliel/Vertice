import { motion } from "framer-motion";
import { traditionalPrep, verticePrep } from "@/data/story";
import { EASE, viewport } from "@/animations/motion";
import { Reveal } from "@/animations/Reveal";
import { Section } from "@/components/ui/Section";
import { Muted, SectionHeader } from "@/components/ui/SectionHeader";
import { LogoMark } from "@/components/ui/Logo";

/* Posições soltas dos fragmentos da preparação tradicional: nada se conecta. */
const scattered = [
  "left-[4%] top-[8%] -rotate-2",
  "right-[6%] top-[18%] rotate-1",
  "left-[14%] top-[44%] rotate-1",
  "right-[2%] top-[58%] -rotate-1",
  "left-[6%] bottom-[8%] rotate-2",
];

export function Differential() {
  const n = verticePrep.length;
  const nodes = verticePrep.map((label, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { label, x: 50 + Math.cos(angle) * 35, y: 50 + Math.sin(angle) * 39 };
  });

  return (
    <Section tone="raised" aria-labelledby="diferencial-title">
      <SectionHeader
        id="diferencial-title"
        layout="stacked"
        title={
          <>
            Um cronograma não acompanha você. <Muted>O VÉRTICE foi pensado para acompanhar.</Muted>
          </>
        }
      />

      <div className="mt-12 grid grid-cols-1 gap-4 lg:mt-16 lg:grid-cols-12">
        <Reveal className="rounded-[var(--radius-window)] border border-line-soft bg-canvas p-6 sm:p-8 lg:col-span-5">
          <h3 className="text-sm font-medium text-fg-subtle">Preparação tradicional</h3>
          <p className="mt-1 text-sm text-fg-faint">Cada ferramenta guarda uma parte. Ninguém junta as partes.</p>

          <ul className="mt-6 flex flex-wrap gap-2 sm:hidden">
            {traditionalPrep.map((item) => (
              <li key={item} className="rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-sm text-fg-subtle">
                {item}
              </li>
            ))}
          </ul>
          <ul className="relative mt-6 hidden h-[340px] sm:block">
            {traditionalPrep.map((item, i) => (
              <li
                key={item}
                className={`absolute rounded-[10px] border border-dashed border-line-strong bg-canvas-2 px-4 py-3 text-sm text-fg-subtle ${scattered[i]}`}
              >
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.12} className="relative overflow-hidden rounded-[var(--radius-window)] border border-line bg-elevated p-6 sm:p-8 lg:col-span-7">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-performance/0 via-performance/60 to-performance/0" />
          <h3 className="text-sm font-medium text-fg">VÉRTICE</h3>
          <p className="mt-1 text-sm text-fg-muted">Um sistema. Cada parte alimenta as outras.</p>

          {/* Mobile: lista conectada */}
          <ul className="mt-6 grid grid-cols-2 gap-2 md:hidden">
            {verticePrep.map((item) => (
              <li key={item} className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm text-fg">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-performance" />
                {item}
              </li>
            ))}
          </ul>

          {/* Desktop: diagrama em estrela */}
          <div className="relative mt-4 hidden h-[400px] md:block">
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
              {nodes.map((node, i) => (
                <motion.line
                  key={node.label}
                  x1="50"
                  y1="50"
                  x2={node.x}
                  y2={node.y}
                  stroke="var(--color-line-strong)"
                  strokeWidth="0.18"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={viewport}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.2 + i * 0.06 }}
                />
              ))}
            </svg>
            <span className="absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border border-line-strong bg-canvas shadow-[0_0_0_8px_rgb(225_6_44/0.06)]">
              <LogoMark className="size-7 text-fg" />
            </span>
            <ul>
              {nodes.map((node, i) => (
                <motion.li
                  key={node.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={viewport}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.5 + i * 0.06 }}
                  className="absolute"
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                >
                  <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm whitespace-nowrap text-fg">
                    {node.label}
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
