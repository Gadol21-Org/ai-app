import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getChatModel, getChatModelId } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { recordUsage } from "@/lib/usage";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages, id: threadId }: { messages: UIMessage[]; id?: string } =
    await req.json();

  const result = streamText({
    abortSignal: req.signal,
    model: getChatModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
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
