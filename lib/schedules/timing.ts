import { Cron } from "croner";
import cronstrue from "cronstrue";

/** Zone the schedules' cron expressions and "now" are expressed in. */
export function scheduleTimezone() {
  const tz = process.env.SCHEDULE_TIMEZONE || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new Error(`Invalid SCHEDULE_TIMEZONE "${tz}". Use an IANA name like Asia/Jerusalem.`);
  }
  return tz;
}

/** Throws a readable error for an expression croner cannot parse (5 fields, or 6 with seconds). */
export function validateCron(expression: string, timezone: string) {
  const fields = expression.trim().split(/\s+/).length;
  if (fields !== 5) throw new Error("Use a 5-field cron expression: minute hour day-of-month month day-of-week.");
  const cron = new Cron(expression, { timezone, paused: true });
  if (!cron.nextRun()) throw new Error("This cron expression never fires.");
}

/** The first firing strictly after `from`, or null if there is none. */
export function nextCronRun(expression: string, timezone: string, from: Date): Date | null {
  return new Cron(expression, { timezone, paused: true }).nextRun(from);
}

export type ScheduleTiming =
  | { kind: "once"; runAt: Date | string | null }
  | { kind: "cron"; cron: string | null; timezone: string };

/** "Every day at 08:00", "Once, 12 Nov 2026 09:00 (Asia/Jerusalem)". */
export function describeTiming(t: ScheduleTiming, timezone: string): string {
  if (t.kind === "cron") {
    let text = t.cron ?? "";
    try {
      text = cronstrue.toString(t.cron ?? "", { use24HourTimeFormat: true });
    } catch {}
    return `${text} (${t.timezone})`;
  }
  const at = t.runAt ? new Date(t.runAt) : null;
  if (!at || Number.isNaN(at.getTime())) return "Once";
  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(at);
  return `Once, ${when} (${timezone})`;
}

/** "Wednesday 2026-11-11 18:08, UTC+02:00 (Asia/Jerusalem)": what the model needs to resolve "tomorrow at 8". */
export function describeNow(timezone: string, now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value.replace("GMT", "") || "+00:00";
  return `${parts.weekday} ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}, UTC${offset.startsWith("+") || offset.startsWith("-") ? offset : "+00:00"} (${timezone})`;
}
