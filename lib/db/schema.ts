import {
  bigint,
  boolean,
  customType,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
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
    /** "schedule" threads hold the conversation a scheduled run produced; the sidebar lists them apart. */
    kind: mysqlEnum("kind", ["chat", "schedule"]).notNull().default("chat"),
    /** `provider:model` picked for this conversation; null means the default model. */
    model: varchar("model", { length: 128 }),
    /** Tools the person allowed to run without asking for the rest of this conversation. */
    allowedTools: json("allowed_tools").$type<string[]>(),
    /** Who started the conversation (null for conversations from before users existed, and scheduled runs). */
    userId: varchar("user_id", { length: 36 }),
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
    /** Who triggered the call (null for scheduled runs and older records). */
    userId: varchar("user_id", { length: 36 }),
    kind: mysqlEnum("kind", ["chat", "title", "schedule"]).notNull().default("chat"),
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

/** A saved prompt the agent runs on its own, once or on a repeating cron schedule. */
export const schedules = mysqlTable(
  "schedules",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 120 }).notNull(),
    prompt: text("prompt").notNull(),
    /** "once" fires at runAt; "cron" repeats on the 5-field `cron` expression. */
    kind: mysqlEnum("kind", ["once", "cron"]).notNull(),
    runAt: timestamp("run_at", { fsp: 3 }),
    cron: varchar("cron", { length: 120 }),
    /** IANA zone the cron expression is evaluated in. */
    timezone: varchar("timezone", { length: 64 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** When the scheduler will fire it next. Null once a one-off has run or the schedule is paused. */
    nextRunAt: timestamp("next_run_at", { fsp: 3 }),
    lastRunAt: timestamp("last_run_at", { fsp: 3 }),
    lastStatus: mysqlEnum("last_status", ["success", "error", "awaiting_approval"]),
    createdAt: createdAt(),
  },
  (t) => [index("schedules_due").on(t.enabled, t.nextRunAt)],
);

/** One row per execution of a schedule, with what the agent answered. */
export const scheduleRuns = mysqlTable(
  "schedule_runs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    scheduleId: varchar("schedule_id", { length: 36 }).notNull(),
    status: mysqlEnum("status", ["running", "success", "error", "awaiting_approval"]).notNull(),
    /** The conversation this run produced (shown in the sidebar's Scheduled tab). */
    threadId: varchar("thread_id", { length: 64 }),
    output: text("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { fsp: 3 }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { fsp: 3 }),
  },
  (t) => [index("schedule_runs_schedule").on(t.scheduleId, t.startedAt)],
);

/**
 * An approval card in a scheduled run's conversation that is waiting for a person. The card itself
 * lives in the conversation; this row lets the app notify people, make sure only one person's
 * answer counts (the first one claims it), and expire cards nobody answers.
 */
export const pendingApprovals = mysqlTable(
  "pending_approvals",
  {
    /** The approval id from the conversation's tool part. */
    id: varchar("id", { length: 64 }).primaryKey(),
    threadId: varchar("thread_id", { length: 64 }).notNull(),
    /** The schedule and run that are blocked on this decision, when the card came from one. */
    scheduleId: varchar("schedule_id", { length: 36 }),
    runId: bigint("run_id", { mode: "number", unsigned: true }),
    toolName: varchar("tool_name", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "denied", "expired"])
      .notNull()
      .default("pending"),
    /** Who answered (null while pending or when it expired). */
    resolvedBy: varchar("resolved_by", { length: 36 }),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { fsp: 3 }),
  },
  (t) => [
    index("pending_approvals_status").on(t.status, t.createdAt),
    index("pending_approvals_thread").on(t.threadId),
  ],
);

/** A person using the app, identified by the email Cloudflare Access puts on each request. */
export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** Stored lower-cased. */
    email: varchar("email", { length: 255 }).notNull(),
    /** Friendly name shown instead of the email; editable in Settings. */
    name: varchar("name", { length: 80 }),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email").on(t.email)],
);

/** A message for one person, kept so it can be read in the app even when push never arrived. */
export const notifications = mysqlTable(
  "notifications",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: text("body").notNull(),
    /** Where tapping the notification goes (a path inside the app). */
    url: varchar("url", { length: 255 }).notNull().default("/notifications"),
    readAt: timestamp("read_at", { fsp: 3 }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user").on(t.userId, t.createdAt)],
);

/** One browser/device that agreed to receive Web Push for a person. */
export const pushSubscriptions = mysqlTable(
  "push_subscriptions",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    endpoint: varchar("endpoint", { length: 600 }).notNull(),
    /** The device's public key; payloads are encrypted to it (RFC 8291). */
    p256dh: varchar("p256dh", { length: 255 }).notNull(),
    auth: varchar("auth", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_endpoint").on(t.endpoint), index("push_user").on(t.userId)],
);

/** MySQL LONGBLOB (up to 4 GB; the connection's max_allowed_packet is the practical limit). */
const longblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "longblob",
});

/**
 * Generated audio, images and videos (the ad pipeline). The bytes live here, not on disk, because
 * the container is replaced on every deploy and has no volume. A video that is still being
 * rendered has no bytes yet: `status` is "generating" and `externalId` is the provider's job id.
 */
export const media = mysqlTable(
  "media",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    kind: mysqlEnum("kind", ["audio", "image", "video"]).notNull(),
    status: mysqlEnum("status", ["generating", "ready", "failed"]).notNull().default("ready"),
    title: varchar("title", { length: 255 }).notNull(),
    /** The script, prompt or other text this was made from. */
    prompt: text("prompt"),
    mimeType: varchar("mime_type", { length: 64 }),
    bytes: bigint("bytes", { mode: "number", unsigned: true }),
    data: longblob("data"),
    /** Provider job id while generating (e.g. an ElevenLabs flows generation). */
    externalId: varchar("external_id", { length: 128 }),
    error: text("error"),
    /** Model, voice, duration and the media it was made from. */
    details: json("details").$type<Record<string, unknown>>(),
    threadId: varchar("thread_id", { length: 64 }),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { fsp: 3 }),
  },
  (t) => [index("media_created").on(t.createdAt), index("media_status").on(t.status)],
);
