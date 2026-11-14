import "server-only";
import type { LanguageModelUsage } from "ai";
import { desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { costUsd, toTokenCounts } from "@/lib/pricing";

const { usageEvents, threads, users } = schema;

/** Record one model call. Never throws: losing a usage row must not break a chat. */
export async function recordUsage(opts: {
  threadId: string | null;
  userId?: string | null;
  kind: "chat" | "title" | "schedule";
  modelId: string;
  usage: LanguageModelUsage;
  /** Free Google grounding used by the call (counted, not priced). */
  searchQueries?: number;
  mapsCalls?: number;
}) {
  try {
    const tokens = toTokenCounts(opts.usage);
    const cost = costUsd(opts.modelId, tokens);
    if (cost === null) console.warn(`no price for ${opts.modelId}; recording $0`);
    await getDb()
      .insert(usageEvents)
      .values({
        threadId: opts.threadId,
        userId: opts.userId ?? null,
        kind: opts.kind,
        model: opts.modelId,
        ...tokens,
        searchQueries: opts.searchQueries ?? 0,
        mapsCalls: opts.mapsCalls ?? 0,
        costUsd: (cost ?? 0).toFixed(8),
      });
  } catch (error) {
    console.error("failed to record usage", error);
  }
}

const totals = {
  costUsd: sql<string>`coalesce(sum(${usageEvents.costUsd}), 0)`.mapWith(Number),
  inputTokens: sql<string>`coalesce(sum(${usageEvents.inputTokens}), 0)`.mapWith(Number),
  outputTokens: sql<string>`coalesce(sum(${usageEvents.outputTokens}), 0)`.mapWith(Number),
  calls: sql<string>`count(*)`.mapWith(Number),
  searchQueries: sql<string>`coalesce(sum(${usageEvents.searchQueries}), 0)`.mapWith(Number),
  mapsCalls: sql<string>`coalesce(sum(${usageEvents.mapsCalls}), 0)`.mapWith(Number),
};

export type SpendTotals = { costUsd: number; inputTokens: number; outputTokens: number; calls: number; searchQueries: number; mapsCalls: number };
export type ConversationSpend = SpendTotals & {
  threadId: string | null;
  title: string | null;
  status: "regular" | "archived" | "deleted" | null;
  lastUsedAt: Date;
};

export async function getSpendSummary() {
  const db = getDb();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [[allTime], [last30Days], byConversation, byModel, byUser] = await Promise.all([
    db.select(totals).from(usageEvents),
    db.select(totals).from(usageEvents).where(gte(usageEvents.createdAt, since)),
    db
      .select({
        threadId: usageEvents.threadId,
        title: sql<string | null>`max(${threads.title})`,
        status: sql<ConversationSpend["status"]>`max(${threads.status})`,
        lastUsedAt: sql<Date>`max(${usageEvents.createdAt})`.mapWith(usageEvents.createdAt),
        ...totals,
      })
      .from(usageEvents)
      .leftJoin(threads, eq(threads.id, usageEvents.threadId))
      .groupBy(usageEvents.threadId)
      .orderBy(desc(sql`max(${usageEvents.createdAt})`))
      .limit(200),
    db
      .select({ model: usageEvents.model, ...totals })
      .from(usageEvents)
      .groupBy(usageEvents.model)
      .orderBy(desc(totals.costUsd)),
    db
      .select({
        userId: usageEvents.userId,
        name: sql<string | null>`max(${users.name})`,
        email: sql<string | null>`max(${users.email})`,
        ...totals,
      })
      .from(usageEvents)
      .leftJoin(users, eq(users.id, usageEvents.userId))
      .groupBy(usageEvents.userId)
      .orderBy(desc(totals.costUsd)),
  ]);
  return { allTime, last30Days, byConversation: byConversation as ConversationSpend[], byModel, byUser };
}
