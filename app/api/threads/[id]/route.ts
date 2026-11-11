import { deleteThread, getThread, updateThread } from "@/lib/threads";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const thread = await getThread((await params).id);
  if (!thread) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(thread);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const body: { title?: unknown; status?: unknown } = await req.json();
  await updateThread((await params).id, {
    title: typeof body.title === "string" ? body.title.slice(0, 255) : undefined,
    status:
      body.status === "regular" || body.status === "archived" ? body.status : undefined,
  });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await deleteThread((await params).id);
  return Response.json({ ok: true });
}
