import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ─────────────────────────────── Badge ── */

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-elevated text-fg-muted",
        info: "bg-info/12 text-info",
        positive: "bg-positive/12 text-positive",
        warning: "bg-warning/12 text-warning",
        danger: "bg-danger/12 text-danger",
        performance: "bg-performance/14 text-performance",
        gold: "bg-gold/12 text-gold",
        outline: "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* ─────────────────────────────── Progress ── */

type Tone = "performance" | "info" | "positive" | "warning" | "danger" | "gold" | "neutral";

const toneBg: Record<Tone, string> = {
  performance: "bg-performance",
  info: "bg-info",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
  gold: "bg-gold",
  neutral: "bg-fg-muted",
};

export function toneForRatio(ratio: number, target = 0.7): Tone {
  if (ratio >= target) return "positive";
  if (ratio >= target - 0.15) return "warning";
  return "danger";
}

export function Progress({
  value,
  max = 1,
  tone = "info",
  className,
  label,
  size = "sm",
}: {
  value: number;
  max?: number;
  tone?: Tone;
  className?: string;
  label: string;
  size?: "xs" | "sm" | "md";
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn(
        "w-full overflow-hidden rounded-full bg-line-soft",
        size === "xs" && "h-1",
        size === "sm" && "h-1.5",
        size === "md" && "h-2",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-[var(--ease-precise)]", toneBg[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ─────────────────────────────── Metric ── */

/**
 * Instrument-style reading: large tabular numeral, unit set smaller on the
 * baseline, label beneath. Never wrapped in a card by default.
 */
export function Metric({
  label,
  value,
  unit,
  detail,
  size = "md",
  className,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  detail?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="order-2 text-sm text-fg-subtle">{label}</dt>
      <dd className="order-1 flex items-baseline gap-1">
        <span
          className={cn(
            "numeral font-medium text-fg",
            size === "sm" && "text-lg",
            size === "md" && "text-xl",
            size === "lg" && "text-2xl",
            valueClassName,
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-fg-subtle">{unit}</span>}
      </dd>
      {detail && <dd className="order-3 text-xs text-fg-subtle">{detail}</dd>}
    </div>
  );
}

/* ─────────────────────────────── Empty state ── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-10", className)}>
      {icon && <div className="text-fg-faint [&_svg]:size-5">{icon}</div>}
      <div className="flex max-w-md flex-col gap-1">
        <h3 className="text-md font-medium text-fg">{title}</h3>
        <p className="text-base text-fg-muted">{description}</p>
      </div>
      {action && <div className="mt-1 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/* ─────────────────────────────── Skeleton ── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius-control)] bg-surface", className)} aria-hidden="true" />;
}

/* ─────────────────────────────── State rail ── */

/**
 * The 2px left rail used on schedule items and topics. Color alone never
 * carries meaning — callers always render a text label alongside.
 */
export function StateRail({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden="true" className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", toneBg[tone], className)} />;
}

/* ─────────────────────────────── Notice ── */

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "positive" | "neutral";
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const border: Record<string, string> = {
    info: "before:bg-info",
    warning: "before:bg-warning",
    danger: "before:bg-danger",
    positive: "before:bg-positive",
    neutral: "before:bg-fg-faint",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-object)] bg-surface py-3 pr-4 pl-5 sm:flex-row sm:items-center sm:justify-between",
        "before:absolute before:inset-y-0 before:left-0 before:w-0.5",
        border[tone],
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        {title && <p className="text-base font-medium text-fg">{title}</p>}
        <div className="text-base text-fg-muted">{children}</div>
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  );
}

/* ─────────────────────────────── Page header ── */

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex max-w-2xl flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{title}</h1>
        {description && <p className="text-base text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({
  children,
  action,
  className,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <Tag className="text-md font-semibold tracking-[-0.01em]">{children}</Tag>
      {action}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-object)] bg-surface", className)} {...props} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] px-1 font-sans text-2xs text-fg-subtle shadow-[inset_0_0_0_1px_var(--line)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
