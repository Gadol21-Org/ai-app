import { runScheduleNow } from "@/lib/schedules/runner";

type Ctx = { params: Promise<{ id: string }> };

/** Starts a run in the background and returns at once; the result shows up on the Settings page. */
export async function POST(_req: Request, { params }: Ctx) {
  const found = await runScheduleNow((await params).id);
  return found ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
