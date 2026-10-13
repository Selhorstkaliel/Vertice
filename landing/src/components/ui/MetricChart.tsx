import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { EASE } from "@/animations/motion";

export type ChartPoint = { label: string; value: number };

type LineChartProps = {
  data: ChartPoint[];
  min?: number;
  max?: number;
  /** Linha de referência (ex.: meta). */
  target?: { value: number; label: string };
  /** Formata os valores exibidos nos rótulos. */
  format?: (value: number) => string;
  showValues?: boolean;
  showAxis?: boolean;
  /** Destaca o último ponto — o vértice da curva. */
  highlightLast?: boolean;
  /** Lado do rótulo da meta, para não colidir com o último ponto. */
  targetLabelAt?: "left" | "right";
  className?: string;
  ariaLabel: string;
};

/**
 * Gráfico de linha em SVG puro. A geometria usa viewBox 0–100 com `non-scaling-stroke`;
 * rótulos e pontos são HTML posicionados em porcentagem, então nada distorce em telas estreitas.
 */
export function LineChart({
  data,
  min = 0,
  max = 100,
  target,
  format = (v) => `${v}%`,
  showValues = true,
  showAxis = true,
  highlightLast = true,
  targetLabelAt = "right",
  className,
  ariaLabel,
}: LineChartProps) {
  const gradientId = useId();
  const n = data.length;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - ((v - min) / (max - min)) * 100;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)} ${y(d.value)}`).join(" ");
  const area = `${line} L100 100 L0 100 Z`;

  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <div className="relative min-h-0 flex-1" role="img" aria-label={ariaLabel}>
        {/* A revelação usa clip-path: pathLength gera tracejado quando combinado com non-scaling-stroke. */}
        <motion.svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden
          initial={{ clipPath: "inset(-10% 100% -10% -2%)" }}
          whileInView={{ clipPath: "inset(-10% -2% -10% -2%)" }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: EASE }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-info)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-info)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((g) => (
            <line key={g} x1="0" x2="100" y1={g} y2={g} stroke="var(--color-line-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {target && (
            <line
              x1="0"
              x2="100"
              y1={y(target.value)}
              y2={y(target.value)}
              stroke="var(--color-fg-subtle)"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-info)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </motion.svg>

        {target && (
          <span
            className={cn("absolute pt-1.5 text-[0.6875rem] text-fg-subtle", targetLabelAt === "right" ? "right-0" : "left-0")}
            style={{ top: `${y(target.value)}%` }}
          >
            {target.label}
          </span>
        )}

        {data.map((d, i) => {
          const last = highlightLast && i === n - 1;
          return (
            <motion.span
              key={d.label}
              className="absolute"
              style={{ left: `${x(i)}%`, top: `${y(d.value)}%` }}
              initial={{ opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.25 + (i / Math.max(1, n - 1)) * 1.1 }}
            >
              <span
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-canvas-2",
                  last ? "size-3.5 bg-performance ring-4 ring-performance/20" : "size-2.5 bg-info",
                )}
              />
              {showValues && (
                <span
                  className={cn(
                    "numeral absolute -translate-x-1/2 -translate-y-[calc(100%+12px)] text-xs font-medium whitespace-nowrap",
                    last ? "text-fg" : "text-fg-muted",
                    i === 0 && "translate-x-0",
                    i === n - 1 && "-translate-x-full",
                  )}
                >
                  {format(d.value)}
                </span>
              )}
            </motion.span>
          );
        })}
      </div>
      {showAxis && (
        <figcaption className="flex justify-between text-[0.6875rem] text-fg-subtle" aria-hidden>
          {data.map((d) => (
            <span key={d.label}>{d.label}</span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/** Barras verticais para séries curtas, com o valor de cada barra acima dela. */
export function BarChart({
  data,
  format = String,
  className,
  ariaLabel,
}: {
  data: ChartPoint[];
  format?: (v: number) => string;
  className?: string;
  ariaLabel: string;
}) {
  const top = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className={cn("flex h-full items-end gap-2 sm:gap-3", className)} role="img" aria-label={ariaLabel}>
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5" aria-hidden>
          <div className="flex w-full flex-1 flex-col items-center justify-end gap-1.5">
            {d.value > 0 && <span className="numeral text-[0.6875rem] whitespace-nowrap text-fg-muted">{format(d.value)}</span>}
            <motion.div
              className={cn("w-full max-w-14 origin-bottom rounded-[5px]", d.value ? "bg-info/80" : "bg-line")}
              style={{ height: d.value ? `${(d.value / top) * 78}%` : "3px" }}
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: EASE, delay: i * 0.05 }}
            />
          </div>
          <span className="text-[0.6875rem] text-fg-subtle">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Minigráfico sem eixos para tendências em linhas de tabela. */
export function Sparkline({ values, className, tone = "info" }: { values: number[]; className?: string; tone?: "info" | "positive" | "danger" | "warning" }) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * 100} ${90 - ((v - lo) / span) * 80}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn("h-6 w-16", className)} aria-hidden>
      <path d={d} fill="none" stroke={`var(--color-${tone})`} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
