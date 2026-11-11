import { generateText } from "ai";
import { getChatModel, getChatModelId } from "@/lib/models";
import { updateThread } from "@/lib/threads";
import { recordUsage } from "@/lib/usage";

type Ctx = { params: Promise<{ id: string }> };

/** Names a conversation from its opening messages, and saves the name. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { text }: { text: string } = await req.json();

  // If the model call fails, fall back to the opening words so the chat still gets a name.
  let title = String(text).replace(/^user:\s*/, "").split("\n")[0].slice(0, 60) || "New chat";
  try {
    const result = await generateText({
      model: getChatModel(),
      system:
        "Write a title of at most 6 words for the conversation below, in the language it is written in. Reply with the title only: no quotes, no trailing punctuation.",
      prompt: String(text).slice(0, 4000),
    });
    await recordUsage({
      threadId: id,
      kind: "title",
      modelId: getChatModelId(),
      usage: result.usage,
    });
    title = result.text.trim().replace(/^["']|["']$/g, "").slice(0, 255) || title;
  } catch (error) {
    console.error("title generation failed", error);
  }

  await updateThread(id, { title });
  return Response.json({ title });
}
