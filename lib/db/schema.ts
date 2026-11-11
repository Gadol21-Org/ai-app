import {
  bigint,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const createdAt = () => timestamp("created_at", { fsp: 3 }).notNull().defaultNow();

/** A conversation. "deleted" keeps the row (and its title) so past spend stays attributable. */
export const threads = mysqlTable(
  "threads",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    title: varchar("title", { length: 255 }),
    status: mysqlEnum("status", ["regular", "archived", "deleted"])
      .notNull()
      .default("regular"),
    createdAt: createdAt(),
    lastMessageAt: timestamp("last_message_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [index("threads_status_last").on(t.status, t.lastMessageAt)],
);

/** Messages exactly as the chat runtime stores them (AI SDK UI message format). */
export const messages = mysqlTable(
  "messages",
  {
    seq: bigint("seq", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    threadId: varchar("thread_id", { length: 64 }).notNull(),
    id: varchar("id", { length: 64 }).notNull(),
    parentId: varchar("parent_id", { length: 64 }),
    format: varchar("format", { length: 32 }).notNull(),
    content: json("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("messages_thread_id").on(t.threadId, t.id)],
);

/** One row per model call. Cost is fixed at write time from lib/pricing.ts. */
export const usageEvents = mysqlTable(
  "usage_events",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    threadId: varchar("thread_id", { length: 64 }),
    kind: mysqlEnum("kind", ["chat", "title"]).notNull().default("chat"),
    model: varchar("model", { length: 128 }).notNull(),
    inputTokens: int("input_tokens").notNull().default(0),
    cachedInputTokens: int("cached_input_tokens").notNull().default(0),
    outputTokens: int("output_tokens").notNull().default(0),
    costUsd: decimal("cost_usd", { precision: 14, scale: 8 }).notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [
    index("usage_created").on(t.createdAt),
    index("usage_thread").on(t.threadId),
  ],
);
