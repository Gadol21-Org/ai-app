import {
  deleteMessages,
  listMessages,
  upsertMessage,
  type StoredMessage,
} from "@/lib/threads";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const format = new URL(req.url).searchParams.get("format") ?? "";
  return Response.json({ messages: await listMessages((await params).id, format) });
}

/** Append or update one message. */
export async function PUT(req: Request, { params }: Ctx) {
  const message: StoredMessage = await req.json();
  if (typeof message?.id !== "string" || typeof message?.format !== "string") {
    return Response.json({ error: "invalid message" }, { status: 400 });
  }
  await upsertMessage((await params).id, message);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { ids }: { ids: string[] } = await req.json();
  await deleteMessages((await params).id, Array.isArray(ids) ? ids : []);
  return Response.json({ ok: true });
}
