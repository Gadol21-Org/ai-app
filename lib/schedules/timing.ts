import { Cron } from "croner";
import cronstrue from "cronstrue/i18n";
import { LOCALE, t } from "@/lib/i18n";

/** Zone the schedules' cron expressions and "now" are expressed in. */
export function scheduleTimezone() {
  const tz = process.env.SCHEDULE_TIMEZONE || "UTC";
  try {
    new Intl.DateTimeFormat(LOCALE, { timeZone: tz });
  } catch {
    throw new Error(t.schedule.errTimezone(tz));
  }
  return tz;
}

/** Throws a readable error for an expression croner cannot parse (5 fields, or 6 with seconds). */
export function validateCron(expression: string, timezone: string) {
  const fields = expression.trim().split(/\s+/).length;
  if (fields !== 5) throw new Error(t.schedule.errCronFields);
  const cron = new Cron(expression, { timezone, paused: true });
  if (!cron.nextRun()) throw new Error(t.schedule.errCronNever);
}

/** The first firing strictly after `from`, or null if there is none. */
export function nextCronRun(expression: string, timezone: string, from: Date): Date | null {
  return new Cron(expression, { timezone, paused: true }).nextRun(from);
}

export type ScheduleTiming =
  | { kind: "once"; runAt: Date | string | null }
  | { kind: "cron"; cron: string | null; timezone: string };

/** "Every day at 08:00", "Once, 12 Nov 2026 09:00 (Asia/Jerusalem)". */
export function describeTiming(timing: ScheduleTiming, timezone: string): string {
  if (timing.kind === "cron") {
    let text = timing.cron ?? "";
    try {
      text = cronstrue.toString(timing.cron ?? "", { use24HourTimeFormat: true, locale: "he" });
    } catch {}
    return `${text} (${timing.timezone})`;
  }
  const at = timing.runAt ? new Date(timing.runAt) : null;
  if (!at || Number.isNaN(at.getTime())) return t.schedule.once;
  const when = new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(at);
  return t.schedule.onceAt(when, timezone);
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
