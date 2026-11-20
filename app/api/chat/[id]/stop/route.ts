import { getCurrentUser, unauthorized } from "@/lib/auth";
import { stopRun } from "@/lib/chat-runs";

type Ctx = { params: Promise<{ id: string }> };

/** The Stop button. A dropped connection does not stop a reply; this does. */
export async function POST(_req: Request, { params }: Ctx) {
  if (!(await getCurrentUser())) return unauthorized();
  return Response.json({ stopped: stopRun((await params).id) });
}
