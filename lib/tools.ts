import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { createSchedule } from "@/lib/schedules/store";
import { describeTiming, scheduleTimezone, validateCron } from "@/lib/schedules/timing";

/**
 * The agent's tools. Each entry says whether a person must allow a call before it runs and
 * whether a scheduled run (which has nobody to ask) may use it. Add new tools here; the chat
 * route and the scheduler both read this registry.
 */
type AgentTool = {
  tool: ToolSet[string];
  /** The call is shown to the person, and only runs after they allow it. */
  requiresApproval: boolean;
  /** Scheduled runs get this tool too. */
  availableInScheduledRuns: boolean;
};

const addSchedule = tool({
  description:
    "Save a prompt to be run automatically later, once or on a repeating schedule (for example a weekly budget summary). " +
    "The user sees the title and prompt and must approve before anything is saved. " +
    "The prompt is run later with no conversation, so make it fully self-contained.",
  inputSchema: z
    .object({
      title: z.string().min(1).max(120).describe("Short name for the schedule, shown in Settings."),
      prompt: z.string().min(1).max(4000).describe("The full instruction to run at each scheduled time."),
      runAt: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("One-off: when to run, ISO 8601 with UTC offset, e.g. 2026-11-12T08:00:00+02:00. Use this OR cron."),
      cron: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Repeating: 5-field cron expression (minute hour day-of-month month day-of-week) in the app's time zone, e.g. '0 8 * * 1-5' for weekdays at 08:00. Use this OR runAt.",
        ),
    })
    // Checked before the user is asked, so they are never shown a schedule that can't be saved.
    .superRefine((v, ctx) => {
      if ((v.runAt === undefined) === (v.cron === undefined)) {
        ctx.addIssue({ code: "custom", message: "Provide exactly one of runAt (one-off) or cron (repeating)." });
      } else if (v.runAt !== undefined && new Date(v.runAt).getTime() <= Date.now()) {
        ctx.addIssue({ code: "custom", path: ["runAt"], message: "The run time is in the past." });
      } else if (v.cron !== undefined) {
        try {
          validateCron(v.cron, scheduleTimezone());
        } catch (error) {
          ctx.addIssue({ code: "custom", path: ["cron"], message: (error as Error).message });
        }
      }
    }),
  execute: async ({ title, prompt, runAt, cron }) => {
    const id = await createSchedule(
      runAt !== undefined
        ? { kind: "once", title, prompt, runAt: new Date(runAt) }
        : { kind: "cron", title, prompt, cron: cron! },
    );
    const tz = scheduleTimezone();
    return {
      id,
      title,
      schedule: describeTiming(
        runAt !== undefined
          ? { kind: "once", runAt: new Date(runAt) }
          : { kind: "cron", cron: cron!, timezone: tz },
        tz,
      ),
    };
  },
});

const registry: Record<string, AgentTool> = {
  add_schedule: { tool: addSchedule, requiresApproval: true, availableInScheduledRuns: false },
};

function pick(filter: (t: AgentTool) => boolean): ToolSet {
  return Object.fromEntries(
    Object.entries(registry)
      .filter(([, t]) => filter(t))
      .map(([name, t]) => [name, t.tool]),
  );
}

/** Tools for an interactive chat. */
export function getChatTools(): ToolSet {
  return pick(() => true);
}

/** Tools for a scheduled run: no self-scheduling, so a schedule can never spawn more schedules. */
export function getScheduledRunTools(): ToolSet {
  return pick((t) => t.availableInScheduledRuns);
}

/** The per-tool approval map for `toolApproval`. */
export function getToolApproval(tools: ToolSet) {
  return Object.fromEntries(
    Object.keys(tools).map((name) => [
      name,
      registry[name]?.requiresApproval ? ("user-approval" as const) : ("not-applicable" as const),
    ]),
  );
}
