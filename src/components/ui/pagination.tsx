import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** URL-driven pagination: keeps every other search param intact. */
export function Pagination({
  page,
  pages,
  basePath,
  params,
}: {
  page: number;
  pages: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "pagina") qs.set(k, v);
    if (p > 1) qs.set("pagina", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const windowed = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-4 pt-4">
      <span className="text-sm text-fg-subtle">
        Página {page} de {pages}
      </span>
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={href(page - 1)} className="flex size-8 items-center justify-center rounded-[var(--radius-control)] text-fg-muted hover:bg-surface hover:text-fg" aria-label="Página anterior">
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className="flex size-8 items-center justify-center text-fg-faint" aria-hidden="true">
              <ChevronLeft className="size-4" />
            </span>
          )}
        </li>
        {windowed.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && windowed[i - 1]! < p - 1 && <span className="px-1 text-fg-faint">…</span>}
            <Link
              href={href(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "numeral flex h-8 min-w-8 items-center justify-center rounded-[var(--radius-control)] px-2 text-sm",
                p === page ? "bg-elevated text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
              )}
            >
              {p}
            </Link>
          </li>
        ))}
        <li>
          {page < pages ? (
            <Link href={href(page + 1)} className="flex size-8 items-center justify-center rounded-[var(--radius-control)] text-fg-muted hover:bg-surface hover:text-fg" aria-label="Próxima página">
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="flex size-8 items-center justify-center text-fg-faint" aria-hidden="true">
              <ChevronRight className="size-4" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}

export function pageFrom(value: string | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
