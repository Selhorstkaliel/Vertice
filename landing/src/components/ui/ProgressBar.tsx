import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { EASE } from "@/animations/motion";

const fills = {
  performance: "bg-performance",
  info: "bg-info",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-fg-subtle",
} as const;

export type ProgressTone = keyof typeof fills;

type ProgressBarProps = {
  value: number;
  max?: number;
  tone?: ProgressTone;
  /** Posição da meta (0–max), desenhada como marcador vertical. */
  target?: number;
  label: string;
  className?: string;
  size?: "sm" | "md";
};

export function ProgressBar({ value, max = 100, tone = "info", target, label, className, size = "sm" }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("relative w-full rounded-full bg-white/[0.07]", size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <motion.div
        className={cn("h-full origin-left rounded-full", fills[tone])}
        style={{ width: `${pct}%` }}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: EASE, delay: 0.15 }}
      />
      {target !== undefined && (
        <span aria-hidden className="absolute -top-1 -bottom-1 w-px bg-fg-muted" style={{ left: `${(target / max) * 100}%` }} />
      )}
    </div>
  );
}
