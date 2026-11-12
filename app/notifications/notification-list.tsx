"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { formatRelative } from "@/lib/relative-time";

export type NotificationItem = {
  id: number;
  title: string;
  body: string;
  url: string;
  read: boolean;
  createdAt: string;
};

const post = (id?: number) =>
  fetch("/api/notifications/read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [read, setRead] = useState(
    () => new Set(items.filter((i) => i.read).map((i) => i.id)),
  );
  const unread = items.filter((i) => !read.has(i.id)).length;

  async function markAll() {
    setRead(new Set(items.map((i) => i.id)));
    await post();
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm">
        <Bell className="size-6" />
        {t.notifications.empty}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {unread > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={markAll}
        >
          <CheckCheck /> {t.notifications.markAllRead}
        </Button>
      )}
      <ul className="flex flex-col gap-2">
        {items.map((n) => {
          const isRead = read.has(n.id);
          return (
            <li key={n.id}>
              <Link
                href={n.url}
                onClick={() => {
                  if (!isRead) post(n.id);
                }}
                className={`hover:bg-muted/50 flex gap-3 rounded-lg border p-3 transition-colors ${isRead ? "" : "bg-muted/30 border-primary/30"}`}
              >
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${isRead ? "bg-transparent" : "bg-primary"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={isRead ? "font-normal" : "font-semibold"}>
                      {n.title}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                    {n.body}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
