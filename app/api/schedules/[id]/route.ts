import { deleteSchedule, enabledToolGroups, getSchedule, setScheduleEnabled, setScheduleToolGroups } from "@/lib/schedules/store";
import { t } from "@/lib/i18n";

type Ctx = { params: Promise<{ id: string }> };

/** What the chat's approval card shows before a schedule is deleted. */
export async function GET(_req: Request, { params }: Ctx) {
  const s = await getSchedule((await params).id);
  if (!s) return Response.json({ error: t.errors.notFound }, { status: 404 });
  return Response.json({
    id: s.id,
    title: s.title,
    prompt: s.prompt,
    kind: s.kind,
    cron: s.cron,
    runAt: s.runAt,
    timezone: s.timezone,
    toolGroups: enabledToolGroups(s),
  });
}

/** Pause or resume (`enabled`), and/or change the tool groups a run may use (`toolGroups`). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { enabled, toolGroups } = await req.json();
  if (enabled === undefined && toolGroups === undefined) {
    return Response.json({ error: t.errors.enabledBoolean }, { status: 400 });
  }
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return Response.json({ error: t.errors.enabledBoolean }, { status: 400 });
  }
  let found = !!(await getSchedule(id));
  if (found && toolGroups !== undefined) {
    try {
      await setScheduleToolGroups(id, toolGroups);
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }
  if (found && enabled !== undefined) found = await setScheduleEnabled(id, enabled);
  return found ? Response.json({ ok: true }) : Response.json({ error: t.errors.notFound }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await deleteSchedule((await params).id);
  return Response.json({ ok: true });
}
