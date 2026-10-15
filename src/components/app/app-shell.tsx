"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bell, LogOut, Menu, Moon, Search, Sun, User } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Kbd } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SheetContent,
} from "@/components/ui/overlay";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/modules/auth/actions";
import { clearOfflineData } from "@/lib/offline-store";
import { CommandPalette } from "./command-palette";
import { RunningSessionPill, type RunningSessionInfo } from "./running-session-pill";
import { isActive, MOBILE_TABS, NAV_GROUPS, SETTINGS_ITEM, visibleNavItem, type NavItem } from "./nav";

export interface ShellUser {
  name: string;
  email: string;
  avatarUrl: string | null;
  isDemo: boolean;
  showMilitary: boolean;
  isAdmin: boolean;
  showEssays: boolean;
  primaryCompetition: string | null;
  unreadNotifications: number;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

export function Avatar({ name, src, className }: { name: string; src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn("size-8 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden="true"
      className={cn("flex size-8 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-fg-muted", className)}
    >
      {initials(name)}
    </span>
  );
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-3 text-base transition-colors",
        active ? "bg-surface font-medium text-fg" : "text-fg-muted hover:bg-surface/60 hover:text-fg",
      )}
    >
      {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-performance" />}
      <Icon className={cn("size-4 shrink-0", active ? "text-fg" : "text-fg-subtle")} strokeWidth={1.75} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavGroups({ pathname, showMilitary, isAdmin, showEssays, onNavigate }: { pathname: string; showMilitary: boolean; isAdmin: boolean; showEssays: boolean; onNavigate?: () => void }) {
  const groups = NAV_GROUPS.map((group) => group.filter((item) => visibleNavItem(item, { showMilitary, isAdmin, showEssays }))).filter((group) => group.length > 0);
  return (
    <nav aria-label="Principal" className="flex flex-col gap-5">
      {groups.map((group, i) => (
        <ul key={i} className="flex flex-col gap-0.5">
          {group
            .map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} onNavigate={onNavigate} />
              </li>
            ))}
        </ul>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme !== "light";
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        setTheme(dark ? "light" : "dark");
      }}
    >
      {dark ? <Sun /> : <Moon />}
      {dark ? "Tema claro" : "Tema escuro"}
    </DropdownMenuItem>
  );
}

function UserMenu({ user, compact = false }: { user: ShellUser; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-3 rounded-[var(--radius-control)] text-left transition-colors hover:bg-surface",
          compact ? "p-1" : "w-full px-2 py-2",
        )}
        aria-label="Menu da conta"
      >
        <Avatar name={user.name} src={user.avatarUrl} />
        {!compact && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-medium text-fg">{user.name}</span>
            <span className="truncate text-sm text-fg-subtle">{user.primaryCompetition ?? "Sem concurso principal"}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-60">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/perfil">
            <User />
            Perfil
          </Link>
        </DropdownMenuItem>
        <ThemeToggle />
        <DropdownMenuSeparator />
        {/* Leaving the account wipes what offline review stored on this device first. */}
        <form
          action={async () => {
            await clearOfflineData().catch(() => undefined);
            await logoutAction();
          }}
        >
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsLink({ count, className }: { count: number; className?: string }) {
  return (
    <Link
      href="/notificacoes"
      className={cn(
        "relative flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-muted transition-colors hover:bg-surface hover:text-fg",
        className,
      )}
      aria-label={count > 0 ? `Notificações: ${count} não lidas` : "Notificações"}
    >
      <Bell className="size-4" strokeWidth={1.75} />
      {count > 0 && (
        <span className="numeral absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-performance px-1 text-2xs font-semibold text-on-performance">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

export function AppShell({
  user,
  runningSession,
  children,
}: {
  user: ShellUser;
  runningSession: RunningSessionInfo | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#conteudo"
        className="sr-only z-[60] rounded-[var(--radius-control)] bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-canvas px-3 py-4 lg:flex">
        <div className="flex items-center justify-between px-2 pb-5">
          <Link href="/painel" className="rounded-[var(--radius-control)]" aria-label="Vértice — Dashboard">
            <Logo />
          </Link>
          <NotificationsLink count={user.unreadNotifications} />
        </div>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mb-5 flex h-9 items-center gap-2.5 rounded-[var(--radius-control)] px-3 text-base text-fg-subtle shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:text-fg"
        >
          <Search className="size-4" strokeWidth={1.75} />
          <span className="flex-1 text-left">Buscar</span>
          <Kbd>Ctrl K</Kbd>
        </button>
        <div className="scrollbar-thin -mx-1 flex-1 overflow-y-auto px-1">
          <NavGroups pathname={pathname} showMilitary={user.showMilitary} isAdmin={user.isAdmin} showEssays={user.showEssays} />
        </div>
        <div className="flex flex-col gap-1 border-t pt-3">
          {runningSession && <RunningSessionPill session={runningSession} />}
          <NavLink item={SETTINGS_ITEM} pathname={pathname} />
          <UserMenu user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-canvas/95 px-4 backdrop-blur-sm lg:hidden">
          <Link href="/painel" aria-label="Vértice — Dashboard" className="rounded-[var(--radius-control)]">
            <LogoMark />
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex size-9 items-center justify-center rounded-[var(--radius-control)] text-fg-muted hover:bg-surface"
              aria-label="Buscar"
            >
              <Search className="size-4" />
            </button>
            <NotificationsLink count={user.unreadNotifications} />
            <UserMenu user={user} compact />
          </div>
        </header>

        {user.isDemo && (
          <div className="border-b bg-canvas-2 px-4 py-2 text-sm text-fg-muted lg:px-10" role="note">
            Conta de demonstração: todos os dados exibidos são fictícios e servem apenas para conhecer a plataforma.
          </div>
        )}

        {runningSession && (
          <div className="border-b px-4 py-2 lg:hidden">
            <RunningSessionPill session={runningSession} />
          </div>
        )}

        <main id="conteudo" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
          {children}
        </main>
      </div>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Navegação rápida"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
      >
        {MOBILE_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-14 flex-col items-center justify-center gap-1 text-2xs", active ? "text-fg" : "text-fg-subtle")}
            >
              <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
              {tab.label}
            </Link>
          );
        })}
        <DialogPrimitive.Root open={moreOpen} onOpenChange={setMoreOpen}>
          <DialogPrimitive.Trigger className="flex h-14 flex-col items-center justify-center gap-1 text-2xs text-fg-subtle">
            <Menu className="size-5" strokeWidth={1.75} />
            Mais
          </DialogPrimitive.Trigger>
          <SheetContent side="bottom" title="Navegação">
            <NavGroups pathname={pathname} showMilitary={user.showMilitary} isAdmin={user.isAdmin} showEssays={user.showEssays} onNavigate={() => setMoreOpen(false)} />
            <div className="mt-5 border-t pt-3">
              <NavLink item={SETTINGS_ITEM} pathname={pathname} onNavigate={() => setMoreOpen(false)} />
            </div>
          </SheetContent>
        </DialogPrimitive.Root>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} showMilitary={user.showMilitary} isAdmin={user.isAdmin} showEssays={user.showEssays} />
    </div>
  );
}
