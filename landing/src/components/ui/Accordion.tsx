import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { EASE } from "@/animations/motion";

export type AccordionItem = { id: string; question: string; answer: ReactNode };

/** Acordeão de item único aberto por vez. Botões nativos com aria-expanded/aria-controls. */
export function Accordion({ items, defaultOpen }: { items: AccordionItem[]; defaultOpen?: string }) {
  const [open, setOpen] = useState<string | null>(defaultOpen ?? null);
  const baseId = useId();

  return (
    <div className="border-t border-line">
      {items.map((item) => {
        const expanded = open === item.id;
        const panelId = `${baseId}-${item.id}-panel`;
        const buttonId = `${baseId}-${item.id}-button`;
        return (
          <div key={item.id} className="border-b border-line">
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : item.id)}
                className="group flex w-full items-center justify-between gap-6 py-5 text-left text-base font-medium text-fg transition-colors hover:text-white sm:py-6 sm:text-lg"
              >
                <span className={cn("transition-colors", !expanded && "text-fg/90")}>{item.question}</span>
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border border-line text-fg-muted transition-[transform,border-color,background-color,color] duration-300 ease-[var(--ease-out-soft)] group-hover:border-line-strong group-hover:text-fg",
                    expanded && "rotate-45 border-performance/50 bg-performance/10 text-fg",
                  )}
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="max-w-2xl pr-12 pb-6 text-[0.9375rem] leading-relaxed text-fg-muted sm:text-base">{item.answer}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
