import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getChatModel } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    abortSignal: req.signal,
    model: getChatModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) =>
      error instanceof Error ? error.message : String(error),
  });
}
