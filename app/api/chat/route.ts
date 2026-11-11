import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { getChatModel, getChatModelId } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { describeNow, scheduleTimezone } from "@/lib/schedules/timing";
import { getChatTools, getToolApproval } from "@/lib/tools";
import { recordUsage } from "@/lib/usage";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, id: threadId }: { messages: UIMessage[]; id?: string } =
    await req.json();

  const tools = getChatTools();

  const result = streamText({
    abortSignal: req.signal,
    model: getChatModel(),
    system: `${SYSTEM_PROMPT}\n\nCurrent time: ${describeNow(scheduleTimezone())}. When a tool call is not approved, do not retry it.`,
    messages: await convertToModelMessages(messages),
    tools,
    toolApproval: getToolApproval(tools),
    stopWhen: isStepCount(5),
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
