import { getCurrentUser, unauthorized } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { sendNotification } from "@/lib/notifications/service";

/** Sends the signed-in person a test notification (inbox + their devices). */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return Response.json(
    await sendNotification({
      title: t.notifications.testTitle,
      body: t.notifications.testBody,
      userIds: [user.id],
    }),
  );
}
