import { deleteSchedule, setScheduleEnabled } from "@/lib/schedules/store";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { enabled } = await req.json();
  if (typeof enabled !== "boolean") {
    return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
  }
  const found = await setScheduleEnabled((await params).id, enabled);
  return found ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await deleteSchedule((await params).id);
  return Response.json({ ok: true });
}
