import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useCountUp } from "@/hooks/useCountUp";

type MetricCardProps = {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Texto de apoio abaixo do valor. */
  hint?: ReactNode;
  delta?: { value: string; direction: "up" | "down"; good?: boolean };
  countUp?: boolean;
  size?: "sm" | "lg";
  className?: string;
};

export function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const { ref, value: current } = useCountUp<HTMLSpanElement>(value, { decimals });
  return (
    <span ref={ref} className="numeral">
      <span aria-hidden>
        {prefix}
        {formatNumber(current, decimals)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {formatNumber(value, decimals)}
        {suffix}
      </span>
    </span>
  );
}

export function MetricCard({ label, value, decimals = 0, prefix, suffix, hint, delta, countUp = false, size = "sm", className }: MetricCardProps) {
  const good = delta?.good ?? delta?.direction === "up";
  const DeltaIcon = delta?.direction === "down" ? ArrowDownRight : ArrowUpRight;

  return (
    <div className={cn("flex flex-col gap-1.5 rounded-[14px] border border-line-soft bg-surface p-4", className)}>
      <span className="text-[0.8125rem] text-fg-subtle">{label}</span>
      <span className={cn("font-semibold tracking-[-0.03em] text-fg", size === "lg" ? "text-4xl sm:text-5xl" : "text-2xl")}>
        {countUp ? (
          <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
        ) : (
          <span className="numeral">
            {prefix}
            {formatNumber(value, decimals)}
            {suffix}
          </span>
        )}
      </span>
      {(delta || hint) && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
          {delta && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-positive" : "text-danger")}>
              <DeltaIcon aria-hidden className="size-3.5" />
              {delta.value}
            </span>
          )}
          {hint}
        </span>
      )}
    </div>
  );
}
