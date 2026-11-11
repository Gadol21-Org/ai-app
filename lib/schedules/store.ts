import "server-only";
import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { nextCronRun, scheduleTimezone, validateCron } from "./timing";

const { schedules, scheduleRuns } = schema;

export type Schedule = typeof schedules.$inferSelect;
export type ScheduleRun = typeof scheduleRuns.$inferSelect;

export type NewSchedule =
  | { title: string; prompt: string; kind: "once"; runAt: Date }
  | { title: string; prompt: string; kind: "cron"; cron: string };

export async function createSchedule(input: NewSchedule) {
  const timezone = scheduleTimezone();
  const title = input.title.trim();
  const prompt = input.prompt.trim();
  if (!title) throw new Error("A schedule needs a title.");
  if (!prompt) throw new Error("A schedule needs a prompt.");

  let nextRunAt: Date | null;
  if (input.kind === "once") {
    if (input.runAt.getTime() <= Date.now()) throw new Error("The run time is in the past.");
    nextRunAt = input.runAt;
  } else {
    validateCron(input.cron, timezone);
    nextRunAt = nextCronRun(input.cron, timezone, new Date());
  }

  const id = crypto.randomUUID();
  await getDb()
    .insert(schedules)
    .values({
      id,
      title,
      prompt,
      kind: input.kind,
      runAt: input.kind === "once" ? input.runAt : null,
      cron: input.kind === "cron" ? input.cron.trim() : null,
      timezone,
      nextRunAt,
    });
  return id;
}

export function listSchedules() {
  return getDb().select().from(schedules).orderBy(desc(schedules.createdAt));
}

export async function getSchedule(id: string) {
  const [row] = await getDb().select().from(schedules).where(eq(schedules.id, id));
  return row;
}

/** Newest first; one query for all schedules' latest run keeps the settings page cheap. */
export async function listRecentRuns(limit = 100) {
  return getDb().select().from(scheduleRuns).orderBy(desc(scheduleRuns.startedAt)).limit(limit);
}

export async function deleteSchedule(id: string) {
  const db = getDb();
  await db.delete(scheduleRuns).where(eq(scheduleRuns.scheduleId, id));
  await db.delete(schedules).where(eq(schedules.id, id));
}

/** Pausing keeps the schedule; resuming a repeating one skips what was missed meanwhile. */
export async function setScheduleEnabled(id: string, enabled: boolean) {
  const s = await getSchedule(id);
  if (!s) return false;
  let nextRunAt = s.nextRunAt;
  if (enabled) {
    if (s.kind === "cron") nextRunAt = nextCronRun(s.cron!, s.timezone, new Date());
    // A one-off that never got to run (paused past its time) fires right away.
    else nextRunAt = s.lastRunAt ? null : (s.runAt ?? null);
  }
  await getDb().update(schedules).set({ enabled, nextRunAt }).where(eq(schedules.id, id));
  return true;
}

/**
 * Takes ownership of every schedule that is due and moves it past this firing in the same
 * statement, so a restart or a second instance can never run the same firing twice.
 */
export async function claimDueSchedules(now = new Date()): Promise<Schedule[]> {
  const db = getDb();
  const due = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, true), isNotNull(schedules.nextRunAt), lte(schedules.nextRunAt, now)))
    .orderBy(asc(schedules.nextRunAt))
    .limit(20);

  const claimed: Schedule[] = [];
  for (const s of due) {
    const next = s.kind === "cron" ? nextCronRun(s.cron!, s.timezone, now) : null;
    const [res] = await db
      .update(schedules)
      .set({ nextRunAt: next, lastRunAt: now })
      .where(and(eq(schedules.id, s.id), eq(schedules.nextRunAt, s.nextRunAt!)));
    if ((res as unknown as { affectedRows: number }).affectedRows === 1) claimed.push(s);
  }
  return claimed;
}

export async function startRun(scheduleId: string) {
  const db = getDb();
  await db.update(schedules).set({ lastRunAt: new Date() }).where(eq(schedules.id, scheduleId));
  const [res] = await db.insert(scheduleRuns).values({ scheduleId, status: "running" });
  return (res as unknown as { insertId: number }).insertId;
}

export async function finishRun(
  runId: number,
  scheduleId: string,
  result: { status: "success" | "error" | "awaiting_approval"; output?: string; error?: string },
) {
  const db = getDb();
  await db
    .update(scheduleRuns)
    .set({
      status: result.status,
      output: result.output ?? null,
      error: result.error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(scheduleRuns.id, runId));
  await db.update(schedules).set({ lastStatus: result.status }).where(eq(schedules.id, scheduleId));
}

/** A run still marked "running" when the server starts was cut off by the restart. */
export async function failInterruptedRuns() {
  await getDb()
    .update(scheduleRuns)
    .set({ status: "error", error: "Interrupted by a server restart.", finishedAt: new Date() })
    .where(eq(scheduleRuns.status, "running"));
}
