import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LogoMark } from "./Logo";
import { DemoTag } from "./Badge";

type DashboardWindowProps = {
  title: string;
  /** Caminho exibido na barra, como a rota da tela no app. */
  path?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  demo?: boolean;
};

/** Moldura de janela do produto. Toda tela demonstrativa passa por aqui e recebe a etiqueta de dados demonstrativos. */
export function DashboardWindow({ title, path, actions, children, className, bodyClassName, demo = true }: DashboardWindowProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-window)] border border-line bg-canvas-2 shadow-[0_40px_80px_-32px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.04)]",
        className,
      )}
    >
      <div className="flex h-12 items-center gap-3 border-b border-line-soft px-4">
        <LogoMark className="size-4 text-fg" />
        <span className="h-4 w-px bg-line" aria-hidden />
        <span className="truncate text-sm font-medium text-fg">{title}</span>
        {path && <span className="hidden truncate text-sm text-fg-subtle sm:inline">{path}</span>}
        <span className="ml-auto flex items-center gap-2">
          {actions}
          {demo && <DemoTag />}
        </span>
      </div>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Painel interno das telas demonstrativas. */
export function Panel({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[14px] border border-line-soft bg-surface p-4", className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h4 className="text-[0.8125rem] font-medium text-fg-muted">{title}</h4>}
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}
