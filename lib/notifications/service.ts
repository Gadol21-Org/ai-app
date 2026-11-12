import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import * as webpush from "web-push";
import { getDb, schema } from "@/lib/db";

const { notifications, pushSubscriptions, users } = schema;

export type Notification = typeof notifications.$inferSelect;

/**
 * Web Push needs a VAPID key pair. Generate one with `npx web-push generate-vapid-keys` and set
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or https: contact URL).
 * Without them notifications still land in the in-app inbox; only the push is skipped.
 */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? process.env.VAPID_PUBLIC_KEY
    : null;
}

let vapidReady = false;
function configureVapid(): boolean {
  if (!vapidPublicKey()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@localhost",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    vapidReady = true;
  }
  return true;
}

/** Only in-app paths: a notification must never send someone to another site. */
function safeUrl(url?: string) {
  return url && url.startsWith("/") && !url.startsWith("//")
    ? url.slice(0, 255)
    : "/notifications";
}

export type SendResult = {
  recipients: number;
  pushed: number;
  pushFailed: number;
};

/**
 * Saves the notification for each recipient (the inbox), then pushes it to each of their devices.
 * `userIds` omitted means everyone. The payload is encrypted for each device with that device's own
 * keys (RFC 8291, aes128gcm) by the web-push library, so the push service only sees ciphertext.
 */
export async function sendNotification(opts: {
  title: string;
  body: string;
  url?: string;
  userIds?: string[];
}): Promise<SendResult> {
  const db = getDb();
  const recipients = opts.userIds
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, opts.userIds))
    : await db.select({ id: users.id }).from(users);
  if (recipients.length === 0)
    return { recipients: 0, pushed: 0, pushFailed: 0 };

  const url = safeUrl(opts.url);
  const title = opts.title.slice(0, 120);
  await db
    .insert(notifications)
    .values(
      recipients.map((r) => ({ userId: r.id, title, body: opts.body, url })),
    );

  let pushed = 0;
  let pushFailed = 0;
  if (configureVapid()) {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(
        inArray(
          pushSubscriptions.userId,
          recipients.map((r) => r.id),
        ),
      );
    const payload = JSON.stringify({ title, body: opts.body, url });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 24 * 60 * 60, urgency: "high" },
          );
          pushed++;
        } catch (error) {
          pushFailed++;
          const status = (error as { statusCode?: number }).statusCode;
          // 404/410: the device unsubscribed or the subscription expired.
          if (status === 404 || status === 410) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, s.id));
          } else {
            console.error("push failed", status ?? error);
          }
        }
      }),
    );
  }
  return { recipients: recipients.length, pushed, pushFailed };
}

export function listNotifications(userId: string, limit = 100) {
  return getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export async function unreadCount(userId: string) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** Marks one notification (or all of the user's) as read. */
export async function markRead(userId: string, id?: number) {
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ...(id === undefined ? [] : [eq(notifications.id, id)]),
      ),
    );
}

export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
) {
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId, ...sub, userAgent: sub.userAgent?.slice(0, 255) })
    .onDuplicateKeyUpdate({
      set: { userId, p256dh: sub.p256dh, auth: sub.auth },
    });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await getDb()
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}
