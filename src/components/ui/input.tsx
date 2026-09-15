import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const fieldBase = [
  "w-full rounded-[var(--radius-control)] bg-canvas-2 text-fg",
  "shadow-[inset_0_0_0_1px_var(--line)]",
  "transition-[box-shadow,background-color] duration-150",
  "hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--fg-subtle)_55%,var(--line))]",
  "focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--info),0_0_0_3px_color-mix(in_oklab,var(--info)_22%,transparent)]",
  "aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--danger)]",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(fieldBase, "h-10 px-3 text-base", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(fieldBase, "min-h-20 resize-y px-3 py-2.5 text-base leading-relaxed", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        fieldBase,
        "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 pl-3 text-base",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237d8592' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
NativeSelect.displayName = "NativeSelect";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-sm font-medium text-fg-muted", className)} {...props} />
));
Label.displayName = "Label";

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | string[];
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error, wired for screen readers via ids. */
export function Field({ label, htmlFor, hint, error, optional, className, children }: FieldProps) {
  const message = Array.isArray(error) ? error[0] : error;
  const describedBy = message ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  const child = React.isValidElement<Record<string, unknown>>(children)
    ? React.cloneElement(children, {
        id: htmlFor,
        "aria-invalid": message ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-fg-subtle">Opcional</span>}
      </Label>
      {child}
      {message ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger" role="alert">
          {message}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
