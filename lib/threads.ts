import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const { threads, messages } = schema;

export type StoredMessage = {
  id: string;
  parent_id: string | null;
  format: string;
  content: Record<string, unknown>;
};

const threadColumns = {
  id: threads.id,
  title: threads.title,
  status: threads.status,
  lastMessageAt: threads.lastMessageAt,
};

export function listThreads() {
  return getDb()
    .select(threadColumns)
    .from(threads)
    .where(ne(threads.status, "deleted"))
    .orderBy(desc(threads.lastMessageAt))
    .limit(500);
}

export async function getThread(id: string) {
  const [row] = await getDb()
    .select(threadColumns)
    .from(threads)
    .where(and(eq(threads.id, id), ne(threads.status, "deleted")));
  return row;
}

/** Idempotent: the client may initialize the same thread more than once. */
export async function createThread(id: string) {
  await getDb()
    .insert(threads)
    .values({ id })
    .onDuplicateKeyUpdate({ set: { id } });
}

export async function updateThread(
  id: string,
  patch: { title?: string; status?: "regular" | "archived" },
) {
  if (patch.title === undefined && patch.status === undefined) return;
  await getDb().update(threads).set(patch).where(eq(threads.id, id));
}

/** Removes the messages; the thread row stays (marked deleted) so its spend keeps a name. */
export async function deleteThread(id: string) {
  const db = getDb();
  await db.delete(messages).where(eq(messages.threadId, id));
  await db.update(threads).set({ status: "deleted" }).where(eq(threads.id, id));
}

export async function listMessages(threadId: string, format: string) {
  const rows = await getDb()
    .select({
      id: messages.id,
      parent_id: messages.parentId,
      format: messages.format,
      content: messages.content,
    })
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.format, format)))
    .orderBy(asc(messages.seq));
  // MariaDB returns JSON columns as text; MySQL returns them parsed.
  return rows.map((r) => ({
    ...r,
    content: typeof r.content === "string" ? JSON.parse(r.content) : r.content,
  })) as StoredMessage[];
}

/** Insert or overwrite by (thread, message id): the runtime re-sends a message when it changes. */
export async function upsertMessage(threadId: string, m: StoredMessage) {
  const db = getDb();
  await db
    .insert(messages)
    .values({
      threadId,
      id: m.id,
      parentId: m.parent_id,
      format: m.format,
      content: m.content,
    })
    .onDuplicateKeyUpdate({
      set: { parentId: m.parent_id, format: m.format, content: m.content },
    });
  await db
    .update(threads)
    .set({ lastMessageAt: sql`now(3)` })
    .where(eq(threads.id, threadId));
}

export async function deleteMessages(threadId: string, ids: string[]) {
  if (ids.length === 0) return;
  await getDb()
    .delete(messages)
    .where(and(eq(messages.threadId, threadId), inArray(messages.id, ids)));
}
