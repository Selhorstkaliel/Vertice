import { useId, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

type Option<T extends string> = { value: T; label: string; hint?: string };

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
};

/** Alternador com indicador animado (radiogroup). Setas do teclado mudam a opção. */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className, size = "md" }: SegmentedControlProps<T>) {
  const layoutId = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = options.findIndex((o) => o.value === value);
    const next = options[(index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    const target = event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`);
    target?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex items-center gap-1 rounded-full border border-line bg-canvas p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            data-value={option.value}
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex items-center gap-2 rounded-full font-medium transition-colors",
              size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm",
              active ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full border border-line-strong bg-elevated"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            )}
            <span className="relative">{option.label}</span>
            {option.hint && <span className="relative text-xs text-positive">{option.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
