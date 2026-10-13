import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Link } from "react-router";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const base =
  "group/button relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-out-soft)] active:translate-y-px disabled:pointer-events-none disabled:opacity-60";

const variants = {
  primary:
    "bg-performance text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.4)] hover:-translate-y-px hover:bg-performance-hover",
  secondary: "border border-line bg-elevated text-fg hover:-translate-y-px hover:border-line-strong hover:bg-[#232933]",
  ghost: "text-fg-muted hover:bg-white/[0.05] hover:text-fg",
  outline: "border border-line text-fg hover:-translate-y-px hover:border-line-strong hover:bg-white/[0.03]",
} as const;

const sizes = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-12 px-6 text-base",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  /** Ícone à direita, com leve deslocamento no hover. */
  icon?: ReactNode;
};

type AsLink = Common & { to: string } & Omit<ComponentPropsWithoutRef<typeof Link>, "to" | "className" | "children">;
type AsAnchor = Common & { href: string } & Omit<ComponentPropsWithoutRef<"a">, "href" | "className" | "children">;
type AsButton = Common & { loading?: boolean } & Omit<ComponentPropsWithoutRef<"button">, "className" | "children">;

export const buttonClasses = (variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) =>
  cn(base, variants[variant], sizes[size], className);

function Content({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <>
      {children}
      {icon && (
        <span aria-hidden className="inline-flex transition-transform duration-200 ease-[var(--ease-out-soft)] group-hover/button:translate-x-0.5">
          {icon}
        </span>
      )}
    </>
  );
}

export function ButtonLink({ variant, size, className, children, icon, ...rest }: AsLink) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      <Content icon={icon}>{children}</Content>
    </Link>
  );
}

export function ButtonAnchor({ variant, size, className, children, icon, ...rest }: AsAnchor) {
  return (
    <a className={buttonClasses(variant, size, className)} {...rest}>
      <Content icon={icon}>{children}</Content>
    </a>
  );
}

export function Button({ variant, size, className, children, icon, loading, type = "button", disabled, ...rest }: AsButton) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      <Content icon={loading ? undefined : icon}>{children}</Content>
    </button>
  );
}
