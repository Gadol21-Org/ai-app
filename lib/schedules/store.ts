import "server-only";
import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { nextCronRun, scheduleTimezone, validateCron } from "./timing";
import { t } from "@/lib/i18n";
import { listScheduleToolGroups } from "@/lib/tools";

const { schedules, scheduleRuns } = schema;

export type Schedule = typeof schedules.$inferSelect;
export type ScheduleRun = typeof scheduleRuns.$inferSelect;

export type NewSchedule =
  | { title: string; prompt: string; toolGroups: string[]; kind: "once"; runAt: Date }
  | { title: string; prompt: string; toolGroups: string[]; kind: "cron"; cron: string };

/** Unknown ids are an error, so a typo can't silently leave a task without the tools it needs. */
export function checkToolGroups(ids: unknown): string[] {
  const known = listScheduleToolGroups().map((g) => g.id);
  if (!Array.isArray(ids) || !ids.every((g) => typeof g === "string")) throw new Error(t.schedule.errGroupsList);
  const unknown = ids.filter((g) => !known.includes(g));
  if (unknown.length > 0) throw new Error(t.schedule.errUnknownGroups(unknown, known));
  return [...new Set(ids as string[])];
}

/**
 * Which groups a run may use. A schedule made before groups existed (null) keeps them all, which
 * is what it could do until now; approval-gated tools still ask either way.
 */
export function enabledToolGroups(s: Pick<Schedule, "toolGroups">): string[] {
  return s.toolGroups ?? listScheduleToolGroups().map((g) => g.id);
}

export async function setScheduleToolGroups(id: string, ids: unknown) {
  const toolGroups = checkToolGroups(ids);
  await getDb().update(schedules).set({ toolGroups }).where(eq(schedules.id, id));
}

export async function createSchedule(input: NewSchedule) {
  const timezone = scheduleTimezone();
  const title = input.title.trim();
  const prompt = input.prompt.trim();
  if (!title) throw new Error(t.schedule.errTitle);
  if (!prompt) throw new Error(t.schedule.errPrompt);
  const toolGroups = checkToolGroups(input.toolGroups);

  let nextRunAt: Date | null;
  if (input.kind === "once") {
    if (input.runAt.getTime() <= Date.now()) throw new Error(t.schedule.errPast);
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
      toolGroups,
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

export async function startRun(scheduleId: string, threadId: string) {
  const db = getDb();
  await db.update(schedules).set({ lastRunAt: new Date() }).where(eq(schedules.id, scheduleId));
  const [res] = await db.insert(scheduleRuns).values({ scheduleId, threadId, status: "running" });
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
    .set({ status: "error", error: t.schedule.interrupted, finishedAt: new Date() })
    .where(eq(scheduleRuns.status, "running"));
}

/**
 * The groups of the schedule whose run produced this conversation: null when the conversation is
 * not a run (or its schedule is gone, or predates groups), meaning no restriction.
 */
export async function toolGroupsOfRunThread(threadId: string): Promise<string[] | null> {
  const [row] = await getDb()
    .select({ toolGroups: schedules.toolGroups })
    .from(scheduleRuns)
    .innerJoin(schedules, eq(schedules.id, scheduleRuns.scheduleId))
    .where(eq(scheduleRuns.threadId, threadId))
    .limit(1);
  return row?.toolGroups ?? null;
}
