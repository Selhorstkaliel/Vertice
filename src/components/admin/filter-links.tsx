import Link from "next/link";
import { cn } from "@/lib/utils";

/** Filter pills that are plain links, so each filter has its own address. */
export function FilterLinks({ base, current, filters, counts }: { base: string; current: string; filters: { value: string; label: string }[]; counts: Record<string, number> }) {
  return (
    <nav aria-label="Filtrar questões" className="flex flex-wrap gap-1.5">
      {filters.map((f) => {
        const active = f.value === current;
        const separator = base.includes("?") ? "&" : "?";
        return (
          <Link
            key={f.value}
            href={`${base}${separator}filtro=${f.value}`}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
              active ? "bg-fg text-canvas" : "text-fg-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg",
            )}
          >
            {f.label}
            <span className={cn("tabular-nums", active ? "text-canvas/70" : "text-fg-subtle")}>{counts[f.value] ?? 0}</span>
          </Link>
        );
      })}
    </nav>
  );
}
