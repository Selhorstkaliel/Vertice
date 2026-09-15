import { cn } from "@/lib/utils";

/**
 * The Vértice mark: two strokes of unequal length rising to meet at a single
 * point. The longer right stroke reads as progression; the apex is the vertex.
 * No enclosing shape — it has to hold at 16px.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-6", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d="M5 9.5 L16 26" stroke="currentColor" strokeWidth="3.2" strokeLinecap="square" fill="none" />
      <path d="M16 26 L27.5 4" stroke="var(--performance)" strokeWidth="3.2" strokeLinecap="square" fill="none" />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-fg", className)}>
      <LogoMark className={markClassName} />
      <span className="text-[0.9375rem] font-semibold tracking-[0.14em]">VÉRTICE</span>
    </span>
  );
}
