import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Reveal } from "@/animations/Reveal";

type SectionHeaderProps = {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  /** `split` coloca a descrição à direita no desktop; `stacked` mantém tudo em coluna. */
  layout?: "split" | "stacked" | "center";
  className?: string;
  as?: "h1" | "h2";
};

/** Títulos com duas frases: a primeira em destaque, a segunda em tom secundário. */
export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-fg-subtle">{children}</span>;
}

export function SectionHeader({ id, title, description, layout = "split", className, as: Heading = "h2" }: SectionHeaderProps) {
  return (
    <Reveal
      className={cn(
        "flex flex-col gap-5",
        layout === "split" && "lg:grid lg:grid-cols-12 lg:items-end lg:gap-10",
        layout === "center" && "items-center text-center",
        className,
      )}
    >
      <Heading
        id={id}
        className={cn(
          "text-balance text-[2.125rem] leading-[1.06] font-semibold tracking-[-0.035em] sm:text-5xl lg:text-[3.5rem]",
          layout === "split" ? "lg:col-span-7" : "max-w-4xl",
        )}
      >
        {title}
      </Heading>
      {description && (
        <p
          className={cn(
            "max-w-xl text-pretty text-base leading-relaxed text-fg-muted sm:text-lg",
            layout === "split" && "lg:col-span-5 lg:justify-self-end lg:pb-2",
          )}
        >
          {description}
        </p>
      )}
    </Reveal>
  );
}
