import { getCurrentUser, unauthorized } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return Response.json({ notifications: await listNotifications(user.id) });
}
