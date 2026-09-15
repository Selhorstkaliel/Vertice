"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export interface ChartColors {
  series: string;
  context: string;
  grid: string;
  axis: string;
  reference: string;
  surface: string;
  text: string;
  textMuted: string;
}

const DARK: ChartColors = {
  series: "#4d7cfe",
  context: "#444b56",
  grid: "#1f242c",
  axis: "#7d8592",
  reference: "#6f7784",
  surface: "#090b0f",
  text: "#f5f7fa",
  textMuted: "#a5acb8",
};

/** Resolved chart tokens; re-read when the theme changes (SVG attributes can't rely on CSS vars everywhere). */
export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = React.useState<ChartColors>(DARK);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      const cs = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
      setColors({
        series: v("--chart-series", DARK.series),
        context: v("--chart-context", DARK.context),
        grid: v("--chart-grid", DARK.grid),
        axis: v("--chart-axis", DARK.axis),
        reference: v("--chart-reference", DARK.reference),
        surface: v("--canvas", DARK.surface),
        text: v("--fg", DARK.text),
        textMuted: v("--fg-muted", DARK.textMuted),
      });
    });
    return () => cancelAnimationFrame(id);
  }, [resolvedTheme]);
  return colors;
}

export const axisTick = (colors: ChartColors) => ({ fill: colors.axis, fontSize: 11, fontFamily: "inherit" });

interface TooltipRow {
  key: string;
  label: string;
  value: string;
  color: string;
  kind?: "line" | "rect";
}

/** Values lead, labels follow; series keyed by a short stroke, never a filled box. */
export function ChartTooltipCard({ title, rows, note }: { title: string; rows: TooltipRow[]; note?: string }) {
  return (
    <div className="min-w-40 rounded-[var(--radius-control)] bg-elevated px-3 py-2 shadow-pop">
      <p className="mb-1.5 text-xs text-fg-subtle">{title}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
            <span className="numeral text-base font-semibold text-fg">{r.value}</span>
            <span className="text-sm text-fg-muted">{r.label}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1.5 text-xs text-fg-subtle">{note}</p>}
    </div>
  );
}

export function LegendItem({ label, color, kind = "rect" }: { label: string; color: string; kind?: "rect" | "line" }) {
  return (
    <li className="flex items-center gap-2 text-sm text-fg-muted">
      <span aria-hidden="true" className={cn(kind === "rect" ? "size-2.5 rounded-[2px]" : "h-0.5 w-3.5 rounded-full")} style={{ background: color }} />
      {label}
    </li>
  );
}

/** Every chart has a table twin so no value depends on hover or color. */
export function TableView({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer text-fg-subtle select-none hover:text-fg">Ver tabela</summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="text-fg-subtle">
              {columns.map((c, i) => (
                <th key={c} className={cn("pb-1.5 font-normal", i > 0 && "text-right")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-line-soft">
                {r.map((cell, ci) => (
                  <td key={ci} className={cn("py-1.5", ci > 0 ? "numeral text-right text-fg" : "text-fg-muted")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function ChartSection({
  id,
  title,
  description,
  legend,
  children,
  table,
  empty,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  legend?: React.ReactNode;
  children: React.ReactNode;
  table?: React.ReactNode;
  empty?: string | null;
}) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-md font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-fg-subtle">{description}</p>}
      </div>
      {empty ? (
        <p className="py-10 text-base text-fg-muted">{empty}</p>
      ) : (
        <>
          {legend && <ul className="flex flex-wrap gap-x-4 gap-y-1">{legend}</ul>}
          {children}
          {table}
        </>
      )}
    </section>
  );
}
