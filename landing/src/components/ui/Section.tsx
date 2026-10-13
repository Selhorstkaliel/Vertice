import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import { Container } from "./Container";

type SectionProps = ComponentPropsWithoutRef<"section"> & {
  containerClassName?: string;
  tone?: "canvas" | "raised";
};

export function Section({ className, containerClassName, tone = "canvas", children, ...props }: SectionProps) {
  return (
    <section
      className={cn("relative py-20 sm:py-24 lg:py-28", tone === "raised" && "border-y border-line-soft bg-canvas-2", className)}
      {...props}
    >
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}
