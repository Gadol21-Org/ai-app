import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getNotifier } from "./notifier";

const { pendingApprovals } = schema;

export type PendingApproval = typeof pendingApprovals.$inferSelect;

/** Saves the request, then tells the notifier. A failing notifier never loses the approval. */
export async function createPendingApproval(opts: {
  source: "schedule";
  sourceId: string;
  runId?: number;
  toolName: string;
  title: string;
  input: unknown;
}) {
  const id = crypto.randomUUID();
  await getDb()
    .insert(pendingApprovals)
    .values({ id, ...opts, runId: opts.runId ?? null, input: opts.input ?? {} });
  try {
    await getNotifier().notifyPendingApproval({
      approvalId: id,
      title: opts.title,
      toolName: opts.toolName,
      url: "/settings/schedules",
    });
  } catch (error) {
    console.error("notifier failed", error);
  }
  return id;
}

export async function listPendingApprovals() {
  const rows = await getDb()
    .select()
    .from(pendingApprovals)
    .where(eq(pendingApprovals.status, "pending"))
    .orderBy(desc(pendingApprovals.createdAt));
  return rows.map((r) => ({
    ...r,
    // MariaDB returns JSON columns as text; MySQL returns them parsed.
    input: typeof r.input === "string" ? JSON.parse(r.input) : r.input,
  }));
}

export async function getPendingApproval(id: string) {
  const [row] = await getDb().select().from(pendingApprovals).where(eq(pendingApprovals.id, id));
  if (!row) return undefined;
  return { ...row, input: typeof row.input === "string" ? JSON.parse(row.input) : row.input };
}

export async function resolvePendingApproval(id: string, status: "approved" | "denied" | "expired") {
  await getDb()
    .update(pendingApprovals)
    .set({ status, resolvedAt: new Date() })
    .where(eq(pendingApprovals.id, id));
}
