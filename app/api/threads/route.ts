import { createThread, listThreads } from "@/lib/threads";
import { isSelectableModel } from "@/lib/model-catalog";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n";

export async function GET() {
  return Response.json({ threads: await listThreads() });
}

export async function POST(req: Request) {
  const { id, model }: { id: string; model?: unknown } = await req.json();
  if (typeof id !== "string" || !id || id.length > 64) {
    return Response.json({ error: t.errors.invalidId }, { status: 400 });
  }
  const user = await getCurrentUser();
  await createThread(id, { model: isSelectableModel(model) ? model : undefined, userId: user?.id });
  return Response.json({ id });
}
