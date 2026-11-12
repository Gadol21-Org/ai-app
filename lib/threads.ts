import "server-only";
import type { UIMessage } from "ai";
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

/** The one format the chat runtime and the server both read and write. */
export const MESSAGE_FORMAT = "ai-sdk/v6";

/** Messages are stored without their id (it is the row's id), as the chat runtime expects. */
export function toUIMessage(m: StoredMessage): UIMessage {
  return { id: m.id, ...m.content } as UIMessage;
}

/** Saves a chat message (insert, or overwrite when the id exists). Used by chat turns and scheduled runs alike. */
export function saveUIMessage(threadId: string, message: UIMessage, parentId: string | null) {
  const { id, ...content } = message;
  return upsertMessage(threadId, { id, parent_id: parentId, format: MESSAGE_FORMAT, content });
}

/** Every stored message of the thread (all branches), oldest first. */
export function listUIMessages(threadId: string) {
  return listMessages(threadId, MESSAGE_FORMAT);
}

/**
 * The conversation as the model should see it: the messages from the root down to `headId`,
 * following parent links, so edited and regenerated branches never leak into each other.
 * Returns undefined when `headId` is not in the thread.
 */
export function pickBranch(all: StoredMessage[], headId: string | null): StoredMessage[] | undefined {
  if (headId === null) return [];
  const byId = new Map(all.map((m) => [m.id, m]));
  const branch: StoredMessage[] = [];
  const seen = new Set<string>();
  for (let cur = byId.get(headId); cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    branch.unshift(cur);
  }
  return branch.length > 0 ? branch : undefined;
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
