import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none",
    "rounded-[var(--radius-control)] font-medium tracking-[-0.005em]",
    "transition-[background-color,color,box-shadow,opacity] duration-150 ease-[var(--ease-precise)]",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // Performance red: the one action that moves preparation forward.
        primary: "bg-performance text-on-performance hover:bg-performance-hover",
        secondary: "bg-elevated text-fg shadow-[inset_0_0_0_1px_var(--line)] hover:bg-line",
        outline: "text-fg shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface",
        ghost: "text-fg-muted hover:bg-surface hover:text-fg",
        subtle: "bg-surface text-fg hover:bg-elevated",
        danger: "text-danger shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--danger)_40%,transparent)] hover:bg-danger/10",
        link: "h-auto px-0 text-info underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-sm [&_svg]:size-3.5",
        md: "h-9 px-4 text-base [&_svg]:size-4",
        lg: "h-11 px-5 text-md [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Spinner className="absolute" />}
            <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
