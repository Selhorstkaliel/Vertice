"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlay";
import { UpdateGuard } from "@/components/app/update-guard";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-right"
      offset={20}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-[var(--radius-object)] !bg-surface !text-fg !shadow-pop !border-0 !font-sans !text-base",
          description: "!text-fg-muted",
          actionButton: "!bg-elevated !text-fg",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "light"]}
      enableSystem={false}
      disableTransitionOnChange
    >
      <TooltipProvider delayDuration={250}>
        {children}
        <ThemedToaster />
        <UpdateGuard />
      </TooltipProvider>
    </ThemeProvider>
  );
}
