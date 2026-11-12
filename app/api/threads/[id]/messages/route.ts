import {
  deleteMessages,
  getMessageAuthors,
  listMessages,
  upsertMessage,
  type StoredMessage,
} from "@/lib/threads";
import { t } from "@/lib/i18n";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const format = new URL(req.url).searchParams.get("format") ?? "";
  const { id } = await params;
  const [rows, authors] = await Promise.all([listMessages(id, format), getMessageAuthors(id)]);
  // `author` ({ userId, sentAt }) is there for the UI to show who wrote a message and when.
  return Response.json({ messages: rows.map((m) => ({ ...m, author: authors.get(m.id) ?? null })) });
}

/** Append or update one message. */
export async function PUT(req: Request, { params }: Ctx) {
  const message: StoredMessage = await req.json();
  if (typeof message?.id !== "string" || typeof message?.format !== "string") {
    return Response.json({ error: t.errors.invalidMessage }, { status: 400 });
  }
  await upsertMessage((await params).id, message);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { ids }: { ids: string[] } = await req.json();
  await deleteMessages((await params).id, Array.isArray(ids) ? ids : []);
  return Response.json({ ok: true });
}
