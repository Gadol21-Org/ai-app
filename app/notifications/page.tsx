import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { listNotifications } from "@/lib/notifications/service";
import { NotificationList } from "./notification-list";
import { PushToggle } from "./push-toggle";

export const metadata: Metadata = {
  title: `${t.notifications.pageTitle} · ${t.appName}`,
};
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  const rows = user ? await listNotifications(user.id) : [];
  return (
    <div className="app-shell overflow-y-auto">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.notifications.backToChat}
          nativeButton={false}
          render={<Link href="/" />}
        >
          <ArrowRight />
        </Button>
        <h1 className="text-sm font-medium">{t.notifications.pageTitle}</h1>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-muted-foreground text-sm">{t.notifications.intro}</p>
        <PushToggle />
        <NotificationList
          items={rows.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            url: n.url,
            read: n.readAt !== null,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
