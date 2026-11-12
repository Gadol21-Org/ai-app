import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const { threads, messages, turnContexts } = schema;

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
  kind: threads.kind,
  model: threads.model,
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
export async function createThread(id: string, opts: { kind?: "chat" | "schedule"; title?: string; model?: string; userId?: string } = {}) {
  await getDb()
    .insert(threads)
    .values({ id, kind: opts.kind ?? "chat", title: opts.title, model: opts.model, userId: opts.userId })
    .onDuplicateKeyUpdate({ set: { id } });
}

export async function updateThread(
  id: string,
  patch: { title?: string; status?: "regular" | "archived"; model?: string },
) {
  if (patch.title === undefined && patch.status === undefined && patch.model === undefined) return;
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

/** Names of the tools allowed to run without asking in this conversation. */
export async function getAllowedTools(id: string): Promise<string[]> {
  const [row] = await getDb()
    .select({ allowedTools: threads.allowedTools })
    .from(threads)
    .where(eq(threads.id, id));
  return Array.isArray(row?.allowedTools) ? row.allowedTools : [];
}

/** Allows a tool without asking for the rest of the conversation (idempotent). */
export async function allowToolInThread(id: string, toolName: string) {
  const current = await getAllowedTools(id);
  if (current.includes(toolName)) return;
  await getDb()
    .update(threads)
    .set({ allowedTools: [...current, toolName] })
    .where(eq(threads.id, id));
}

/** Notes already sent with this conversation's user messages, by message id. */
export async function getTurnContexts(threadId: string): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ messageId: turnContexts.messageId, note: turnContexts.note })
    .from(turnContexts)
    .where(eq(turnContexts.threadId, threadId));
  return new Map(rows.map((r) => [r.messageId, r.note]));
}

/** Keeps the first note a message got: later turns must replay exactly what was sent before. */
export async function saveTurnContext(
  threadId: string,
  messageId: string,
  note: string,
  userId: string | null,
) {
  await getDb()
    .insert(turnContexts)
    .values({ threadId, messageId, note, userId })
    .onDuplicateKeyUpdate({ set: { note: sql`${turnContexts.note}` } });
}

/** Who wrote each user message and when, for showing it in the UI (not used by the client yet). */
export async function getMessageAuthors(threadId: string) {
  const rows = await getDb()
    .select({
      messageId: turnContexts.messageId,
      userId: turnContexts.userId,
      sentAt: turnContexts.createdAt,
    })
    .from(turnContexts)
    .where(eq(turnContexts.threadId, threadId));
  return new Map(rows.map((r) => [r.messageId, { userId: r.userId, sentAt: r.sentAt }]));
}
