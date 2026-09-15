"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────── Switch ── */

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors",
      "bg-line data-[state=checked]:bg-info disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-fg shadow transition-transform duration-150 data-[state=checked]:translate-x-4 data-[state=checked]:bg-white" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

/* ─────────────────────────────── Checkbox ── */

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer size-4 shrink-0 rounded-[4px] shadow-[inset_0_0_0_1px_var(--fg-faint)] transition-colors",
      "data-[state=checked]:bg-info data-[state=checked]:shadow-none disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-white">
      <Check className="size-3" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

/* ─────────────────────────────── Choice group ── */

/**
 * Large selectable options (onboarding, filters). Built on RadioGroup so
 * arrow-key navigation and roles come for free.
 */
export function ChoiceGroup<T extends string>({
  value,
  onValueChange,
  options,
  name,
  className,
  columns = 1,
  "aria-label": ariaLabel,
}: {
  value: T | undefined;
  onValueChange: (value: T) => void;
  options: { value: T; label: string; description?: string }[];
  name?: string;
  className?: string;
  columns?: 1 | 2 | 3 | 4;
  "aria-label"?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      name={name}
      aria-label={ariaLabel}
      className={cn(
        "grid gap-2",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-3",
        columns === 4 && "grid-cols-2 sm:grid-cols-4",
        className,
      )}
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className={cn(
            "group flex items-start gap-3 rounded-[var(--radius-object)] px-4 py-3 text-left transition-[box-shadow,background-color]",
            "shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface",
            "data-[state=checked]:bg-surface data-[state=checked]:shadow-[inset_0_0_0_1px_var(--fg-muted)]",
          )}
        >
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--fg-faint)] group-data-[state=checked]:shadow-[inset_0_0_0_5px_var(--fg)]" />
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-medium text-fg">{o.label}</span>
            {o.description && <span className="text-sm text-fg-subtle">{o.description}</span>}
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/** Compact segmented control for view switches (Dia/Semana/Mês). */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  "aria-label": string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      aria-label={ariaLabel}
      orientation="horizontal"
      className={cn("inline-flex rounded-[var(--radius-control)] bg-canvas-2 p-0.5 shadow-[inset_0_0_0_1px_var(--line)]", className)}
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className="h-7 rounded-[5px] px-3 text-sm font-medium text-fg-subtle transition-colors hover:text-fg data-[state=checked]:bg-elevated data-[state=checked]:text-fg"
        >
          {o.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/* ─────────────────────────────── Tabs ── */

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("scrollbar-thin flex gap-6 overflow-x-auto hairline-b", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative -mb-px shrink-0 pb-3 text-base font-medium text-fg-subtle transition-colors hover:text-fg",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-transparent",
        "data-[state=active]:text-fg data-[state=active]:after:bg-fg",
        className,
      )}
      {...props}
    />
  );
}

/* ─────────────────────────────── Select ── */

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Selecione",
  className,
  id,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] bg-canvas-2 px-3 text-left text-base",
          "shadow-[inset_0_0_0_1px_var(--line)] data-[placeholder]:text-fg-subtle",
          "focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--info),0_0_0_3px_color-mix(in_oklab,var(--info)_22%,transparent)]",
          "aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--danger)] disabled:opacity-50",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-fg-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-object)] bg-surface shadow-pop data-[state=open]:animate-pop-in"
        >
          <SelectPrimitive.Viewport className="scrollbar-thin p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-default items-center rounded-[5px] py-2 pr-8 pl-2.5 text-base outline-none select-none data-[highlighted]:bg-elevated"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <Check className="size-3.5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
