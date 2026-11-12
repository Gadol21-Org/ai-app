import { convertToModelMessages, isStepCount, pruneMessages, streamText, type UIMessage } from "ai";
import { getChatModel, getChatModelId } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { describeNow, scheduleTimezone } from "@/lib/schedules/timing";
import { getChatTools, getToolApproval } from "@/lib/tools";
import { recordUsage } from "@/lib/usage";

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
  const { messages, id: threadId }: { messages: UIMessage[]; id?: string } =
    await req.json();

  const tools = await getChatTools();

  const result = streamText({
    abortSignal: req.signal,
    model: getChatModel(),
    system: `${SYSTEM_PROMPT}\n\nCurrent time: ${describeNow(scheduleTimezone())}. When a tool call is not approved, do not retry it.`,
    // Old tool calls and their (possibly big) results are not re-sent to the model every turn.
    messages: pruneMessages({
      messages: await convertToModelMessages(denyUnansweredApprovals(messages)),
      toolCalls: "before-last-4-messages",
    }),
    tools,
    toolApproval: getToolApproval(tools),
    // Building a trip means many tool calls in a row.
    stopWhen: isStepCount(10),
    onFinish: ({ totalUsage }) =>
      recordUsage({
        threadId: threadId ?? null,
        kind: "chat",
        modelId: getChatModelId(),
        usage: totalUsage,
      }),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
