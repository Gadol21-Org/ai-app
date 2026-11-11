import {
  convertToModelMessages,
  isStepCount,
  pruneMessages,
  streamText,
  type UIMessage,
} from "ai";
import { getMcpTools } from "@/lib/mcp";
import { getChatModel } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    abortSignal: req.signal,
    model: getChatModel(),
    system: SYSTEM_PROMPT,
    // Old tool calls and their (possibly big) results are not re-sent to the model every turn.
    messages: pruneMessages({
      messages: await convertToModelMessages(messages),
      toolCalls: "before-last-4-messages",
    }),
    tools: await getMcpTools(),
    stopWhen: isStepCount(10),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
