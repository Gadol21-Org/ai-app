import { generateText } from "ai";
import { getChatModel, getChatModelId } from "@/lib/models";
import { listUIMessages, toUIMessage, updateThread } from "@/lib/threads";
import { recordUsage } from "@/lib/usage";
import { t } from "@/lib/i18n";

type Ctx = { params: Promise<{ id: string }> };

/** Names a conversation from its opening messages (read from the database), and saves the name. */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const text = (await listUIMessages(id))
    .slice(0, 6)
    .map(toUIMessage)
    .map((m) => `${m.role}: ${m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ")}`)
    .join("\n");

  // If the model call fails, fall back to the opening words so the chat still gets a name.
  let title = String(text).replace(/^user:\s*/, "").split("\n")[0].slice(0, 60) || t.prompts.fallbackTitle;
  try {
    const result = await generateText({
      model: getChatModel(),
      system:
        "Write a title of at most 6 words for the conversation below, in the language it is written in (Hebrew by default). Reply with the title only: no quotes, no trailing punctuation.",
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
