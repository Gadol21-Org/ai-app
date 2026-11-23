import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getMediaSummary } from "@/lib/media/store";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** Lets a player that shows "generating" find out when the file is ready. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return unauthorized();
  const row = await getMediaSummary((await params).id);
  if (!row) return Response.json({ error: t.errors.notFound }, { status: 404 });
  return Response.json({ status: row.status });
}
