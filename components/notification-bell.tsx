"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

/** Header bell with the unread count; refreshed on focus and every minute. */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/notifications/unread", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setUnread(d.unread))
        .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative ms-auto"
      aria-label={
        unread > 0 ? t.notifications.bellUnread(unread) : t.notifications.bell
      }
      nativeButton={false}
      render={<Link href="/notifications" />}
    >
      <Bell />
      {unread > 0 && (
        <span className="bg-destructive text-destructive-foreground absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-medium tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  );
}
