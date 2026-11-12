import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const { media } = schema;

export type MediaKind = "audio" | "image" | "video";
export type MediaRow = typeof media.$inferSelect;
/** A media row without its bytes, for lists. */
export type MediaSummary = Omit<MediaRow, "data">;

const summaryColumns = {
  id: media.id,
  kind: media.kind,
  status: media.status,
  title: media.title,
  prompt: media.prompt,
  mimeType: media.mimeType,
  bytes: media.bytes,
  externalId: media.externalId,
  error: media.error,
  details: media.details,
  threadId: media.threadId,
  createdAt: media.createdAt,
  finishedAt: media.finishedAt,
};

/** MariaDB returns JSON columns as text; MySQL returns them parsed. */
const parseDetails = <T extends { details: unknown }>(row: T) => ({
  ...row,
  details: (typeof row.details === "string" ? JSON.parse(row.details) : row.details) as Record<string, unknown> | null,
});

/** URL the browser (and the chat) uses to show or download a stored file. */
export const mediaUrl = (id: string) => `/api/media/${id}`;

export async function saveMedia(opts: {
  kind: MediaKind;
  title: string;
  prompt?: string;
  mimeType: string;
  data: Buffer;
  details?: Record<string, unknown>;
  threadId?: string;
}) {
  const id = crypto.randomUUID();
  await getDb()
    .insert(media)
    .values({
      id,
      kind: opts.kind,
      status: "ready",
      title: opts.title.slice(0, 255),
      prompt: opts.prompt ?? null,
      mimeType: opts.mimeType,
      bytes: opts.data.length,
      data: opts.data,
      details: opts.details ?? null,
      threadId: opts.threadId ?? null,
      finishedAt: new Date(),
    });
  return id;
}

/** Records a render that is still running at the provider; `completeMedia` fills it in later. */
export async function startMedia(opts: {
  kind: MediaKind;
  title: string;
  prompt?: string;
  externalId: string;
  details?: Record<string, unknown>;
  threadId?: string;
}) {
  const id = crypto.randomUUID();
  await getDb()
    .insert(media)
    .values({
      id,
      kind: opts.kind,
      status: "generating",
      title: opts.title.slice(0, 255),
      prompt: opts.prompt ?? null,
      externalId: opts.externalId,
      details: opts.details ?? null,
      threadId: opts.threadId ?? null,
    });
  return id;
}

export async function completeMedia(id: string, file: { mimeType: string; data: Buffer }) {
  await getDb()
    .update(media)
    .set({ status: "ready", mimeType: file.mimeType, bytes: file.data.length, data: file.data, finishedAt: new Date() })
    .where(eq(media.id, id));
}

export async function failMedia(id: string, error: string) {
  await getDb()
    .update(media)
    .set({ status: "failed", error: error.slice(0, 2000), finishedAt: new Date() })
    .where(eq(media.id, id));
}

export async function getMedia(id: string) {
  const [row] = await getDb().select().from(media).where(eq(media.id, id));
  return row && parseDetails(row);
}

export async function getMediaSummary(id: string) {
  const [row] = await getDb().select(summaryColumns).from(media).where(eq(media.id, id));
  return row && parseDetails(row);
}

export async function listMedia(opts: { kind?: MediaKind; limit?: number } = {}) {
  const query = getDb().select(summaryColumns).from(media);
  const rows = await (opts.kind ? query.where(eq(media.kind, opts.kind)) : query)
    .orderBy(desc(media.createdAt))
    .limit(opts.limit ?? 200);
  return rows.map(parseDetails);
}

export async function listGenerating() {
  const rows = await getDb().select(summaryColumns).from(media).where(eq(media.status, "generating"));
  return rows.map(parseDetails);
}

export async function deleteMedia(id: string) {
  await getDb().delete(media).where(eq(media.id, id));
}
