import { ArrowRight, CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { listRecentRuns, listSchedules, type Schedule, type ScheduleRun } from "@/lib/schedules/store";
import { describeTiming } from "@/lib/schedules/timing";
import { ScheduleActions } from "./schedule-actions";

export const metadata: Metadata = { title: `${t.schedule.pageTitle} · ${t.appName}` };
export const dynamic = "force-dynamic";

function StatusBadge({ s }: { s: Schedule }) {
  if (!s.enabled) return <Badge variant="outline">{t.schedule.paused}</Badge>;
  if (s.kind === "once" && s.nextRunAt === null && s.lastRunAt) return <Badge variant="outline">{t.schedule.done}</Badge>;
  if (s.lastStatus === "awaiting_approval") return <Badge variant="secondary">{t.schedule.needsApproval}</Badge>;
  if (s.lastStatus === "error") return <Badge variant="destructive">{t.schedule.lastRunFailed}</Badge>;
  return <Badge variant="secondary">{t.schedule.active}</Badge>;
}

function ScheduleCard({ s, lastRun }: { s: Schedule; lastRun?: ScheduleRun }) {
  const finished = s.kind === "once" && s.nextRunAt === null && s.lastRunAt !== null;
  const when = (d: Date | null) => (d ? formatDateTime(d, s.timezone) : "–");
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{s.title}</h3>
              <StatusBadge s={s} />
            </div>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {describeTiming(
                s.kind === "cron"
                  ? { kind: "cron", cron: s.cron, timezone: s.timezone }
                  : { kind: "once", runAt: s.runAt },
                s.timezone,
              )}
            </p>
          </div>
          <ScheduleActions id={s.id} title={s.title} enabled={s.enabled} canResume={!finished} />
        </div>

        <p className="bg-muted/50 line-clamp-3 rounded-md p-2.5 text-sm whitespace-pre-wrap">{s.prompt}</p>

        <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 text-sm sm:max-w-sm">
          <div>
            <dt className="text-xs">{t.schedule.nextRun}</dt>
            <dd className="text-foreground">{s.enabled ? when(s.nextRunAt) : "–"}</dd>
          </div>
          <div>
            <dt className="text-xs">{t.schedule.lastRun}</dt>
            <dd className="text-foreground">{when(s.lastRunAt)}</dd>
          </div>
        </dl>

        {lastRun && (lastRun.output || lastRun.error) && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer">{t.schedule.lastResult}</summary>
            <p
              className={
                lastRun.error
                  ? "text-destructive mt-2 whitespace-pre-wrap"
                  : "mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap"
              }
            >
              {lastRun.error ?? lastRun.output}
            </p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

export default async function SchedulesPage() {
  const [schedules, runs] = await Promise.all([listSchedules(), listRecentRuns()]);
  const lastRunBySchedule = new Map<string, ScheduleRun>();
  for (const r of runs) if (!lastRunBySchedule.has(r.scheduleId) && r.status !== "running") lastRunBySchedule.set(r.scheduleId, r);

  return (
    <div className="app-shell overflow-y-auto">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button variant="ghost" size="icon" aria-label={t.schedule.backToSettings} nativeButton={false} render={<Link href="/settings" />}>
          <ArrowRight />
        </Button>
        <h1 className="text-sm font-medium">{t.schedule.pageTitle}</h1>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-muted-foreground text-sm">
          {t.schedule.intro}
        </p>
        {schedules.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm">
            <CalendarClock className="size-6" />
            {t.schedule.empty}
          </div>
        ) : (
          schedules.map((s) => <ScheduleCard key={s.id} s={s} lastRun={lastRunBySchedule.get(s.id)} />)
        )}
      </main>
    </div>
  );
}
