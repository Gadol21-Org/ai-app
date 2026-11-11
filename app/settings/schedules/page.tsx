import { ArrowLeft, CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { listRecentRuns, listSchedules, type Schedule, type ScheduleRun } from "@/lib/schedules/store";
import { describeTiming } from "@/lib/schedules/timing";
import { ScheduleActions } from "./schedule-actions";

export const metadata: Metadata = { title: "Schedules · Family AI" };
export const dynamic = "force-dynamic";

function StatusBadge({ s }: { s: Schedule }) {
  if (!s.enabled) return <Badge variant="outline">Paused</Badge>;
  if (s.kind === "once" && s.nextRunAt === null && s.lastRunAt) return <Badge variant="outline">Done</Badge>;
  if (s.lastStatus === "awaiting_approval") return <Badge variant="secondary">Needs approval</Badge>;
  if (s.lastStatus === "error") return <Badge variant="destructive">Last run failed</Badge>;
  return <Badge variant="secondary">Active</Badge>;
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
            <dt className="text-xs">Next run</dt>
            <dd className="text-foreground">{s.enabled ? when(s.nextRunAt) : "–"}</dd>
          </div>
          <div>
            <dt className="text-xs">Last run</dt>
            <dd className="text-foreground">{when(s.lastRunAt)}</dd>
          </div>
        </dl>

        {lastRun && (lastRun.output || lastRun.error) && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer">Last result</summary>
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
    <div className="h-dvh overflow-y-auto">
      <header className="bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button variant="ghost" size="icon" aria-label="Back to settings" nativeButton={false} render={<Link href="/settings" />}>
          <ArrowLeft />
        </Button>
        <h1 className="text-sm font-medium">Scheduled prompts</h1>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-muted-foreground text-sm">
          Prompts the assistant runs on its own, once or on a repeat. Ask it in a chat to add one; you
          approve the title and prompt before it is saved.
        </p>
        {schedules.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm">
            <CalendarClock className="size-6" />
            No schedules yet. Try: &quot;Every Sunday at 9am, summarize my week of spending.&quot;
          </div>
        ) : (
          schedules.map((s) => <ScheduleCard key={s.id} s={s} lastRun={lastRunBySchedule.get(s.id)} />)
        )}
      </main>
    </div>
  );
}
