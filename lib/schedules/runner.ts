import "server-only";
import { generateText, isStepCount } from "ai";
import { createPendingApproval } from "@/lib/approvals/pending";
import { getChatModel, getChatModelId } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { getScheduledRunTools, getToolApproval } from "@/lib/tools";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { createThread, upsertMessage } from "@/lib/threads";
import { recordUsage } from "@/lib/usage";
import {
  claimDueSchedules,
  failInterruptedRuns,
  finishRun,
  getSchedule,
  startRun,
  type Schedule,
} from "./store";
import { describeNow, scheduleTimezone } from "./timing";

const TICK_MS = 30_000;
const RUN_TIMEOUT_MS = 5 * 60_000;

/** Runs one schedule's prompt through the agent and records the outcome. Never throws. */
export async function runSchedule(schedule: Schedule) {
  // Every run is saved as a conversation (shown in the sidebar's Scheduled tab), stored in the
  // same format the chat uses so it opens, and can be continued, like any other chat.
  const threadId = crypto.randomUUID();
  const userMessageId = crypto.randomUUID();
  const reply = (text: string) =>
    upsertMessage(threadId, {
      id: crypto.randomUUID(),
      parent_id: userMessageId,
      format: "ai-sdk/v6",
      content: { role: "assistant", parts: [{ type: "step-start" }, { type: "text", text }] },
    });
  const runId = await (async () => {
    await createThread(threadId, {
      kind: "schedule",
      title: t.schedule.runTitle(schedule.title, formatDateTime(new Date(), schedule.timezone)),
    });
    await upsertMessage(threadId, {
      id: userMessageId,
      parent_id: null,
      format: "ai-sdk/v6",
      content: { role: "user", parts: [{ type: "text", text: schedule.prompt }], metadata: { custom: {} } },
    });
    return startRun(schedule.id, threadId);
  })();
  try {
    const tools = getScheduledRunTools(threadId);
    const result = await generateText({
      abortSignal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      model: getChatModel(),
      system:
        `${SYSTEM_PROMPT}\n\nThis is a scheduled task titled "${schedule.title}" running automatically; ` +
        `nobody is watching, so do not ask questions. Current time: ${describeNow(scheduleTimezone())}.`,
      prompt: schedule.prompt,
      tools,
      toolApproval: getToolApproval(tools),
      stopWhen: isStepCount(10),
    });
    await recordUsage({
      threadId,
      kind: "schedule",
      modelId: getChatModelId(),
      usage: result.totalUsage,
    });

    // A tool that needs a person's OK can't run unattended: park it and let the notifier know.
    const requests = result.content.flatMap((p) =>
      p.type === "tool-approval-request" && !p.isAutomatic ? [p] : [],
    );
    for (const request of requests) {
      await createPendingApproval({
        source: "schedule",
        sourceId: schedule.id,
        runId,
        toolName: request.toolCall.toolName,
        title: schedule.title,
        input: request.toolCall.input,
      });
    }
    await reply(
      result.text ||
        (requests.length > 0 ? t.schedule.runNeedsApproval : t.schedule.runNoReply),
    );
    await finishRun(runId, schedule.id, {
      status: requests.length > 0 ? "awaiting_approval" : "success",
      output: result.text,
    });
  } catch (error) {
    console.error(`scheduled run "${schedule.title}" failed`, error);
    const message = error instanceof Error ? error.message : String(error);
    await reply(t.schedule.runFailed(message)).catch(() => {});
    await finishRun(runId, schedule.id, {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Fires everything that is due. Also catches up after downtime: a missed firing runs once. */
export async function runDueSchedules() {
  for (const schedule of await claimDueSchedules()) await runSchedule(schedule);
}

/** Run a schedule right now, outside its timetable ("Run now" in Settings). */
export async function runScheduleNow(id: string) {
  const schedule = await getSchedule(id);
  if (!schedule) return false;
  void runSchedule(schedule).catch((error) => console.error("run now failed", error));
  return true;
}

const globalForScheduler = globalThis as unknown as { __schedulerTimer?: NodeJS.Timeout; __ticking?: boolean };

/** Polls the database, so schedules (and pending firings) live in MySQL and survive restarts. */
export async function startScheduler() {
  if (globalForScheduler.__schedulerTimer) return;
  await failInterruptedRuns();
  const tick = async () => {
    if (globalForScheduler.__ticking) return;
    globalForScheduler.__ticking = true;
    try {
      await runDueSchedules();
    } catch (error) {
      console.error("scheduler tick failed", error);
    } finally {
      globalForScheduler.__ticking = false;
    }
  };
  globalForScheduler.__schedulerTimer = setInterval(tick, TICK_MS);
  globalForScheduler.__schedulerTimer.unref();
  void tick();
  console.log("scheduler started");
}
