import "server-only";
import { generateId, isStepCount, streamText, type UIMessage } from "ai";
import { approvalCards, expireStaleApprovals, notifyApprovalNeeded, trackApprovals } from "@/lib/approvals/pending";
import { getChatModel, getChatModelId } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { getScheduledRunTools, getToolApproval } from "@/lib/tools";
import { t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { createThread, saveUIMessage } from "@/lib/threads";
import { TURN_CONTEXT_KEY } from "@/lib/turn-context";
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
    saveUIMessage(
      threadId,
      { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "step-start" }, { type: "text", text }] },
      userMessageId,
    );
  // What the model is told besides the prompt, kept on the message like a chat turn's context.
  const context = {
    userId: null,
    sentAt: new Date().toISOString(),
    note:
      `Scheduled task: "${schedule.title}".\n` +
      `Current time: ${describeNow(scheduleTimezone())}.\n` +
      `Tool groups enabled for this task: ${schedule.toolGroups ? schedule.toolGroups.join(", ") || "none" : "all"}.\n` +
      `Written by: nobody; this is an automatic run, so no user is speaking. Use list_users to find who to notify.`,
  };
  const runId = await (async () => {
    await createThread(threadId, {
      kind: "schedule",
      title: t.schedule.runTitle(schedule.title, formatDateTime(new Date(), schedule.timezone)),
    });
    await saveUIMessage(
      threadId,
      {
        id: userMessageId,
        role: "user",
        parts: [{ type: "text", text: schedule.prompt }],
        metadata: { [TURN_CONTEXT_KEY]: context },
      },
      null,
    );
    return startRun(schedule.id, threadId);
  })();
  try {
    const tools = await getScheduledRunTools(threadId, schedule.toolGroups);
    const modelId = getChatModelId();
    const result = streamText({
      abortSignal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      model: getChatModel(),
      // Constant across runs (cacheable); the run's own details go after the prompt instead.
      system: `${SYSTEM_PROMPT}\n\nThis is a scheduled task running automatically; nobody is watching right now, so do not ask questions. A tool that needs a person's approval pauses the task: its card is saved in this conversation and everyone is notified. Do the preparation that needs no approval first, then request the approval-requiring call, and say in your reply what is waiting for approval. When someone answers, the conversation continues from there.`,
      prompt: `${schedule.prompt}\n\n<context>\n${context.note}\n</context>`,
      tools,
      toolApproval: getToolApproval(tools),
      stopWhen: isStepCount(10),
      onFinish: ({ totalUsage }) => recordUsage({ threadId, kind: "schedule", modelId, usage: totalUsage }),
    });

    // The reply is saved the way a chat turn's is, tool calls and approval cards included, so the
    // person can open the conversation, answer the cards, and the turn continues from there.
    let saved: UIMessage | undefined;
    let streamError: string | undefined;
    for await (const chunk of result.toUIMessageStream({
      originalMessages: [],
      generateMessageId: generateId,
      onError: (error) => (error instanceof Error ? error.message : String(error)),
      onEnd: ({ responseMessage }) => {
        saved = responseMessage;
      },
    })) {
      // A failed tool call is an ordinary part of the reply; only an error of the run itself stops it.
      if (chunk.type === "error") streamError = chunk.errorText;
    }
    if (streamError) throw new Error(streamError);
    if (!saved || !saved.parts.some((p) => p.type !== "step-start"))
      saved = { id: generateId(), role: "assistant", parts: [{ type: "text", text: t.schedule.runNoReply }] };
    await saveUIMessage(threadId, saved, userMessageId);

    // A tool that needs a person's OK: end the run cleanly here. The card waits in the saved
    // conversation; everyone is told, and the first person to answer it resumes the work.
    const cards = await trackApprovals(saved, { threadId, scheduleId: schedule.id, runId });
    await notifyApprovalNeeded({ threadId, title: schedule.title, cards });
    const waiting = approvalCards(saved).some((c) => c.state === "approval-requested");
    await finishRun(runId, schedule.id, {
      status: waiting ? "awaiting_approval" : "success",
      output: saved.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n"),
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
      await expireStaleApprovals();
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
