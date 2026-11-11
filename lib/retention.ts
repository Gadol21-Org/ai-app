import "server-only";
import { and, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const { threads, messages } = schema;

/** How long a conversation is kept after its last message. 0 keeps everything. */
export function retentionDays() {
  const n = Number(process.env.RETENTION_DAYS ?? 30);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

/**
 * Deletes the messages of conversations whose last message is older than the
 * retention period, archived ones included, and marks them deleted. The thread
 * row stays so its name still labels its spend. Returns how many were purged.
 */
export async function purgeExpiredThreads(now = new Date()) {
  const days = retentionDays();
  if (days === 0) return 0;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const db = getDb();
  const expired = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(ne(threads.status, "deleted"), lt(threads.lastMessageAt, cutoff)))
    .limit(500);
  if (expired.length === 0) return 0;

  const ids = expired.map((t) => t.id);
  // Re-check the cutoff in the UPDATE so a message that arrived meanwhile wins.
  await db.transaction(async (tx) => {
    const stale = await tx
      .select({ id: threads.id })
      .from(threads)
      .where(and(inArray(threads.id, ids), lt(threads.lastMessageAt, cutoff)))
      .for("update");
    const staleIds = stale.map((t) => t.id);
    if (staleIds.length === 0) return;
    await tx.delete(messages).where(inArray(messages.threadId, staleIds));
    await tx
      .update(threads)
      .set({ status: "deleted", lastMessageAt: sql`${threads.lastMessageAt}` })
      .where(inArray(threads.id, staleIds));
  });
  return ids.length;
}
