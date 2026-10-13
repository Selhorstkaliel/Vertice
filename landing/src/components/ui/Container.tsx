import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/** Largura máxima e margens laterais da página. Em telas com entalhe, a margem acompanha a área segura. */
export function Container({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1240px]",
        "ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))]",
        "sm:ps-[max(2rem,env(safe-area-inset-left))] sm:pe-[max(2rem,env(safe-area-inset-right))]",
        "lg:ps-[max(2.5rem,env(safe-area-inset-left))] lg:pe-[max(2.5rem,env(safe-area-inset-right))]",
        className,
      )}
      {...props}
    />
  );
}
