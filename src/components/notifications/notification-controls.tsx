"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import {
  clearReadNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  setNotificationPreferenceAction,
} from "@/modules/notifications/actions";
import { cn } from "@/lib/utils";

export interface NotificationView {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  typeLabel: string;
  when: string;
  unread: boolean;
}

export function NotificationItem({ n }: { n: NotificationView }) {
  const router = useRouter();
  const [unread, setUnread] = React.useState(n.unread);

  const markRead = async () => {
    if (!unread) return;
    setUnread(false);
    const r = await markNotificationReadAction(n.id);
    if (!r.ok) {
      setUnread(true);
      toast.error(r.error);
    } else router.refresh();
  };

  return (
    <li className="relative border-b border-line-soft last:border-b-0">
      {unread && <span aria-hidden="true" className="absolute top-4 bottom-4 left-0 w-0.5 rounded-full bg-info" />}
      <div className="flex flex-col gap-1 py-4 pl-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className={cn("text-base", unread ? "font-medium text-fg" : "text-fg-muted")}>
            {unread && <span className="sr-only">Não lida: </span>}
            {n.title}
          </p>
          {n.body && <p className="text-sm text-fg-subtle">{n.body}</p>}
          <p className="text-sm text-fg-subtle">
            {n.typeLabel}, {n.when}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 max-sm:-ml-3">
          {n.href && (
            <Button asChild size="sm" variant="link" className="px-3">
              <Link href={n.href} onClick={() => void markRead()}>
                Abrir
              </Link>
            </Button>
          )}
          {unread && (
            <Button size="sm" variant="ghost" onClick={() => void markRead()}>
              Marcar como lida
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

export function NotificationBulkActions({ unread, read }: { unread: number; read: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        if (r.message) toast.success(r.message);
        router.refresh();
      }
    });
  return (
    <>
      {unread > 0 && (
        <Button variant="secondary" size="sm" loading={pending} onClick={() => run(markAllNotificationsReadAction)}>
          <CheckCheck />
          Marcar todas como lidas
        </Button>
      )}
      {read > 0 && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(clearReadNotificationsAction)}>
          <Trash2 />
          Remover lidas
        </Button>
      )}
    </>
  );
}

export function NotificationPreferenceSwitch({ type, label, description, enabled }: { type: string; label: string; description?: string; enabled: boolean }) {
  const [checked, setChecked] = React.useState(enabled);
  const [pending, startTransition] = React.useTransition();
  const id = `pref-${type}`;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-soft py-3 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-base text-fg">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-sm text-fg-subtle">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        aria-describedby={description ? `${id}-desc` : undefined}
        checked={checked}
        disabled={pending}
        onCheckedChange={(value) => {
          setChecked(value);
          startTransition(async () => {
            const r = await setNotificationPreferenceAction(type, value);
            if (!r.ok) {
              setChecked(!value);
              toast.error(r.error);
            }
          });
        }}
      />
    </div>
  );
}
