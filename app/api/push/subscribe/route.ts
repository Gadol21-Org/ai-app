import { getCurrentUser, unauthorized } from "@/lib/auth";
import { t } from "@/lib/i18n";
import {
  removeSubscription,
  saveSubscription,
} from "@/lib/notifications/service";

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { endpoint, keys }: Body = await req.json();
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    endpoint.length > 600 ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string"
  ) {
    return Response.json({ error: t.errors.invalidMessage }, { status: 400 });
  }
  await saveSubscription(user.id, {
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { endpoint } = await req.json();
  if (typeof endpoint === "string") await removeSubscription(user.id, endpoint);
  return Response.json({ ok: true });
}
