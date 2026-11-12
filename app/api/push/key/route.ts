import { getCurrentUser, unauthorized } from "@/lib/auth";
import { vapidPublicKey } from "@/lib/notifications/service";

export const dynamic = "force-dynamic";

/** The server's VAPID public key (null when push isn't configured); read at runtime, not build time. */
export async function GET() {
  if (!(await getCurrentUser())) return unauthorized();
  return Response.json({ key: vapidPublicKey() });
}
