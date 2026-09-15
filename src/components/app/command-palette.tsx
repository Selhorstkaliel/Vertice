"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { CornerDownLeft, FileText, Search } from "lucide-react";
import { globalSearch, type SearchHit } from "@/modules/search/actions";
import { NAV_GROUPS, SETTINGS_ITEM, visibleNavItem } from "./nav";

const SETTINGS_SECTIONS = [
  { label: "Conta", href: "/configuracoes#conta" },
  { label: "Aparência e tema", href: "/configuracoes#aparencia" },
  { label: "Notificações", href: "/configuracoes#notificacoes" },
  { label: "Preferências de estudo", href: "/configuracoes#estudos" },
  { label: "Privacidade e dados", href: "/configuracoes#dados" },
  { label: "Segurança e senha", href: "/configuracoes#seguranca" },
];

const itemClass =
  "flex cursor-default items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-base text-fg outline-none select-none data-[selected=true]:bg-elevated [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle";
const groupClass =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:text-fg-subtle";

export function CommandPalette({
  open,
  onOpenChange,
  showMilitary,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showMilitary: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
    }
  }, [open]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const id = window.setTimeout(async () => {
      try {
        const result = await globalSearch(q);
        if (!cancelled) setHits(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const pages = [...NAV_GROUPS.flat().filter((i) => visibleNavItem(i, { showMilitary, isAdmin })), SETTINGS_ITEM];
  const grouped = hits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.group] ??= []).push(h);
    return acc;
  }, {});

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[var(--radius-panel)] bg-surface shadow-pop data-[state=open]:animate-pop-in focus:outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Buscar no Vértice</DialogPrimitive.Title>
          <Command shouldFilter={false} loop label="Buscar no Vértice">
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="size-4 text-fg-subtle" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Buscar concursos, matérias, tópicos, flashcards, questões…"
                className="h-13 flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-subtle"
              />
              {loading && <span className="text-sm text-fg-subtle">Buscando…</span>}
            </div>
            <Command.List className="scrollbar-thin max-h-[min(60vh,440px)] overflow-y-auto p-2">
              {query.trim().length >= 2 && !loading && hits.length === 0 && (
                <Command.Empty className="px-3 py-8 text-center text-base text-fg-muted">
                  Nada encontrado para “{query.trim()}”.
                </Command.Empty>
              )}

              {Object.entries(grouped).map(([group, list]) => (
                <Command.Group key={group} heading={group} className={groupClass}>
                  {list.map((h) => (
                    <Command.Item key={h.id} value={h.id} onSelect={() => go(h.href)} className={itemClass}>
                      <FileText />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{h.title}</span>
                        {h.subtitle && <span className="truncate text-sm text-fg-subtle">{h.subtitle}</span>}
                      </span>
                      <CornerDownLeft className="opacity-0 [[data-selected=true]_&]:opacity-100" />
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}

              {query.trim().length < 2 && (
                <>
                  <Command.Group heading="Páginas" className={groupClass}>
                    {pages.map((p) => {
                      const Icon = p.icon;
                      return (
                        <Command.Item key={p.href} value={p.href} onSelect={() => go(p.href)} className={itemClass}>
                          <Icon />
                          {p.label}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                  <Command.Group heading="Configurações" className={groupClass}>
                    {SETTINGS_SECTIONS.map((s) => (
                      <Command.Item key={s.href} value={s.href} onSelect={() => go(s.href)} className={itemClass}>
                        <SETTINGS_ITEM.icon />
                        {s.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
