import { convertToModelMessages, isStepCount, pruneMessages, streamText, type UIMessage } from "ai";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getChatModel, resolveChatModelId } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { describeNow, scheduleTimezone } from "@/lib/schedules/timing";
import { getChatTools, getToolApproval } from "@/lib/tools";
import { getAllowedTools, getTurnContexts, saveTurnContext, updateThread } from "@/lib/threads";
import { recordUsage } from "@/lib/usage";
import { TURN_CONTEXT_INSTRUCTIONS, describeSpeaker, withTurnContexts } from "@/lib/turn-context";

export const maxDuration = 60;

/**
 * An approval card the person ignored (they typed a message instead of tapping Allow or Deny)
 * counts as a denial, so the model is told the call did not run rather than left with a dangling
 * request.
 */
function denyUnansweredApprovals(messages: UIMessage[]): UIMessage[] {
  if (messages.at(-1)?.role !== "user") return messages;
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((part) =>
      "state" in part && part.state === "approval-requested" && "approval" in part
        ? {
            ...part,
            state: "approval-responded" as const,
            approval: { id: part.approval.id, approved: false, reason: "The user replied instead of approving." },
          }
        : part,
    ),
  })) as UIMessage[];
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const {
    messages,
    id: threadId,
    model,
  }: { messages: UIMessage[]; id?: string; model?: unknown } = await req.json();
  const modelId = resolveChatModelId(model);
  // Remember the pick so reopening the conversation shows (and keeps using) the same model.
  if (threadId) await updateThread(threadId, { model: modelId }).catch(() => {});

  const tools = await getChatTools(threadId);
  const allowedTools = threadId ? await getAllowedTools(threadId) : [];

  // Each user message keeps the note it was first sent with, so the history stays byte-identical
  // from turn to turn (prompt cache). Only the newest message gets a fresh note.
  const notes = threadId ? await getTurnContexts(threadId) : new Map<string, string>();
  const newest = messages.findLast((m) => m.role === "user");
  if (newest && !notes.has(newest.id)) {
    const note = `Current time: ${describeNow(scheduleTimezone())}.\n${describeSpeaker(user)}`;
    notes.set(newest.id, note);
    if (threadId) await saveTurnContext(threadId, newest.id, note).catch(() => {});
  }

  const result = streamText({
    abortSignal: req.signal,
    model: getChatModel(modelId),
    // Constant, so the provider's prompt cache can reuse it and the conversation after it.
    system: `${SYSTEM_PROMPT}\n\n${TURN_CONTEXT_INSTRUCTIONS} When a tool call is not approved, do not retry it.`,
    messages: pruneMessages({
      // Old tool calls and their (possibly big) results are not re-sent to the model every turn.
      messages: await convertToModelMessages(
        withTurnContexts(denyUnansweredApprovals(messages), notes),
      ),
      toolCalls: "before-last-4-messages",
    }),
    tools,
    toolApproval: getToolApproval(tools, allowedTools),
    // Building a trip means many tool calls in a row.
    stopWhen: isStepCount(10),
    onFinish: ({ totalUsage }) =>
      recordUsage({
        threadId: threadId ?? null,
        userId: user.id,
        kind: "chat",
        modelId,
        usage: totalUsage,
      }),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
