import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  neutral: "border-line bg-white/[0.03] text-fg-muted",
  performance: "border-performance/35 bg-performance/10 text-[#ff6680]",
  info: "border-info/30 bg-info/10 text-[#8eabff]",
  positive: "border-positive/25 bg-positive/10 text-positive",
  warning: "border-warning/25 bg-warning/10 text-warning",
  danger: "border-danger/25 bg-danger/10 text-[#ff7f8a]",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", className, children, icon }: { tone?: BadgeTone; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/** Etiqueta de dados ilustrativos. Toda interface com números fictícios usa esta marcação. */
export function DemoTag({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap text-fg-subtle",
        className,
      )}
    >
      <span aria-hidden className="size-1 rounded-full bg-fg-subtle" />
      {label ?? (
        <>
          <span className="sm:hidden">Demonstrativo</span>
          <span className="hidden sm:inline">Dados demonstrativos</span>
        </>
      )}
    </span>
  );
}
