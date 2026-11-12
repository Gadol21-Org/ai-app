import { getCurrentUser, unauthorized } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return Response.json({ unread: await unreadCount(user.id) });
}
