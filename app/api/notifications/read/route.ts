import { getCurrentUser, unauthorized } from "@/lib/auth";
import { markRead } from "@/lib/notifications/service";

/** Body `{ id }` marks one notification read; no id marks all of them. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await req.json().catch(() => ({}));
  await markRead(user.id, typeof id === "number" ? id : undefined);
  return Response.json({ ok: true });
}
