import { deleteMessages, listMessages } from "@/lib/threads";

type Ctx = { params: Promise<{ id: string }> };

/** The browser only reads history here; the chat endpoint is the one that writes messages. */
export async function GET(req: Request, { params }: Ctx) {
  const format = new URL(req.url).searchParams.get("format") ?? "";
  return Response.json({ messages: await listMessages((await params).id, format) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { ids }: { ids: string[] } = await req.json();
  await deleteMessages((await params).id, Array.isArray(ids) ? ids : []);
  return Response.json({ ok: true });
}
