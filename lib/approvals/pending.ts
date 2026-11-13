import "server-only";
import type { UIMessage } from "ai";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { t } from "@/lib/i18n";
import { sendNotification } from "@/lib/notifications/service";
import { conversationUrl } from "@/lib/conversation-url";
import { listUIMessages, saveUIMessage, toUIMessage } from "@/lib/threads";

const { pendingApprovals, scheduleRuns, schedules } = schema;

/** How long an approval card waits before it expires and counts as denied (default 3 days). */
export function approvalTtlMs() {
  const hours = Number(process.env.APPROVAL_TTL_HOURS);
  return (hours > 0 ? hours : 72) * 60 * 60 * 1000;
}

type AnyPart = UIMessage["parts"][number];

/** An approval card in a stored message: its approval id and the tool call it belongs to. */
export type ApprovalCard = { approvalId: string; toolCallId: string; toolName: string; state: string };

export function approvalCards(message: UIMessage): ApprovalCard[] {
  return message.parts.flatMap((part) => {
    const p = part as AnyPart & { toolCallId?: string; toolName?: string; state?: string; approval?: { id?: string } };
    if (!p.toolCallId || !p.approval?.id || !p.state) return [];
    const toolName = p.type === "dynamic-tool" ? p.toolName : p.type.replace(/^tool-/, "");
    return [{ approvalId: p.approval.id, toolCallId: p.toolCallId, toolName: toolName ?? "", state: p.state }];
  });
}

/**
 * Makes sure every approval card still waiting in `message` has a pending row (a card put back
 * to waiting after a failed turn gets its row back). Returns the cards that are new.
 */
export async function trackApprovals(
  message: UIMessage,
  opts: { threadId: string; scheduleId?: string; runId?: number },
) {
  const waiting = approvalCards(message).filter((c) => c.state === "approval-requested");
  if (waiting.length === 0) return [];
  const db = getDb();
  const known = await db
    .select({ id: pendingApprovals.id })
    .from(pendingApprovals)
    .where(inArray(pendingApprovals.id, waiting.map((c) => c.approvalId)));
  const knownIds = new Set(known.map((k) => k.id));
  for (const card of waiting) {
    await db
      .insert(pendingApprovals)
      .values({
        id: card.approvalId,
        threadId: opts.threadId,
        scheduleId: opts.scheduleId ?? null,
        runId: opts.runId ?? null,
        toolName: card.toolName,
      })
      .onDuplicateKeyUpdate({ set: { status: "pending", resolvedBy: null, resolvedAt: null } });
  }
  return waiting.filter((c) => !knownIds.has(c.approvalId));
}

/** Tells every user (inbox and push) that a scheduled run is waiting for a decision. */
export async function notifyApprovalNeeded(opts: { threadId: string; title: string; cards: ApprovalCard[] }) {
  if (opts.cards.length === 0) return;
  try {
    await sendNotification({
      title: t.notifications.approvalTitle,
      body: t.notifications.approvalBody(opts.title, opts.cards.length),
      url: conversationUrl(opts.threadId, opts.cards[0].toolCallId),
    });
  } catch (error) {
    // The cards are saved in the conversation either way; they just wait there.
    console.error("approval notification failed", error);
  }
}

export class ApprovalConflict extends Error {}

/**
 * Takes the right to answer these cards for `userId`. The first answer wins: when the card was
 * already answered (or expired) by someone else this throws, and nothing is changed. Cards that
 * are not tracked (an ordinary chat's) are always free to answer.
 */
export async function claimApprovals(threadId: string, answers: { id: string; approved: boolean }[], userId: string) {
  if (answers.length === 0) return;
  const db = getDb();
  const rows = await db
    .select()
    .from(pendingApprovals)
    .where(and(eq(pendingApprovals.threadId, threadId), inArray(pendingApprovals.id, answers.map((a) => a.id))));
  const claimed: string[] = [];
  for (const row of rows) {
    const answer = answers.find((a) => a.id === row.id)!;
    const [res] = await db
      .update(pendingApprovals)
      .set({ status: answer.approved ? "approved" : "denied", resolvedBy: userId, resolvedAt: new Date() })
      .where(and(eq(pendingApprovals.id, row.id), eq(pendingApprovals.status, "pending")));
    if (res.affectedRows === 0) {
      // Give back what this call took, so a half-answered request doesn't strand the other cards.
      if (claimed.length > 0)
        await db
          .update(pendingApprovals)
          .set({ status: "pending", resolvedBy: null, resolvedAt: null })
          .where(inArray(pendingApprovals.id, claimed));
      throw new ApprovalConflict(row.status === "expired" ? t.schedule.approvalExpired : t.schedule.approvalTaken);
    }
    claimed.push(row.id);
  }
}

/** A scheduled run whose cards have all been answered (or expired) is no longer "awaiting approval". */
export async function settleRunsOfThread(threadId: string) {
  const db = getDb();
  const open = await db
    .select({ id: pendingApprovals.id })
    .from(pendingApprovals)
    .where(and(eq(pendingApprovals.threadId, threadId), eq(pendingApprovals.status, "pending")))
    .limit(1);
  const runs = await db
    .select({ id: scheduleRuns.id, scheduleId: scheduleRuns.scheduleId })
    .from(scheduleRuns)
    .where(and(eq(scheduleRuns.threadId, threadId), eq(scheduleRuns.status, "awaiting_approval")));
  for (const run of runs) {
    if (open.length > 0) continue;
    const status = "success" as const;
    await db.update(scheduleRuns).set({ status }).where(eq(scheduleRuns.id, run.id));
    // Only if this run is still the schedule's latest.
    await db
      .update(schedules)
      .set({ lastStatus: status })
      .where(and(eq(schedules.id, run.scheduleId), eq(schedules.lastStatus, "awaiting_approval")));
  }
}

/** Gives up on cards nobody answered in time: they show as denied, and the run is settled. */
export async function expireStaleApprovals(now = new Date()) {
  const db = getDb();
  const cutoff = new Date(now.getTime() - approvalTtlMs());
  const stale = await db
    .select()
    .from(pendingApprovals)
    .where(and(eq(pendingApprovals.status, "pending"), lt(pendingApprovals.createdAt, cutoff)));
  const threads = new Set<string>();
  for (const row of stale) {
    const [res] = await db
      .update(pendingApprovals)
      .set({ status: "expired", resolvedAt: now })
      .where(and(eq(pendingApprovals.id, row.id), eq(pendingApprovals.status, "pending")));
    if (res.affectedRows === 0) continue; // someone answered just now
    threads.add(row.threadId);
    const stored = (await listUIMessages(row.threadId)).find((m) =>
      approvalCards(toUIMessage(m)).some((c) => c.approvalId === row.id),
    );
    if (!stored) continue;
    const message = toUIMessage(stored);
    const parts = message.parts.map((part) => {
      const p = part as { approval?: { id?: string }; state?: string };
      return p.approval?.id === row.id && p.state === "approval-requested"
        ? { ...part, state: "output-denied" as const, approval: { id: row.id, approved: false, reason: t.schedule.approvalExpired } }
        : part;
    }) as UIMessage["parts"];
    await saveUIMessage(row.threadId, { ...message, parts }, stored.parent_id);
  }
  for (const threadId of threads) await settleRunsOfThread(threadId);
  return stale.length;
}
