import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { downloadContent, getGeneration, isElevenLabsConfigured, type FlowKind } from "@/lib/elevenlabs/client";
import { sendNotification } from "@/lib/notifications/service";
import { t } from "@/lib/i18n";
import { completeMedia, failMedia, listGenerating, type MediaSummary } from "./store";

const TICK_MS = 10_000;
/** A render that has not finished by then is given up on (the provider's own limit is shorter). */
const GIVE_UP_MS = 45 * 60_000;
const LIBRARY_URL = "/settings/media";

/** Who asked: the conversation's owner. Scheduled runs and unowned threads notify everyone. */
async function recipients(threadId: string | null): Promise<string[] | undefined> {
  if (!threadId) return undefined;
  const [row] = await getDb().select({ userId: schema.threads.userId }).from(schema.threads).where(eq(schema.threads.id, threadId));
  return row?.userId ? [row.userId] : undefined;
}

async function notify(row: MediaSummary, title: string, body: string) {
  try {
    await sendNotification({ title, body, url: LIBRARY_URL, userIds: await recipients(row.threadId) });
  } catch (error) {
    console.error("media notification failed", error);
  }
}

async function check(row: MediaSummary) {
  const kind = (row.details?.flow as FlowKind | undefined) ?? "video";
  if (!row.externalId) return failMedia(row.id, "Missing provider id.");
  if (Date.now() - row.createdAt.getTime() > GIVE_UP_MS) {
    await failMedia(row.id, t.mediaLibrary.timedOut);
    return notify(row, t.mediaLibrary.failedTitle, t.mediaLibrary.failedBody(row.title, t.mediaLibrary.timedOut));
  }
  const state = await getGeneration(kind, row.externalId);
  if (state.status === "completed") {
    await completeMedia(row.id, { mimeType: state.mimeType, data: await downloadContent(state.contentUrl) });
    return notify(row, t.mediaLibrary.readyTitle, t.mediaLibrary.readyBody(row.title));
  }
  if (state.status === "failed") {
    await failMedia(row.id, `${state.reason}: ${state.message}`);
    return notify(row, t.mediaLibrary.failedTitle, t.mediaLibrary.failedBody(row.title, state.message));
  }
}

/** Finishes every video that is still rendering: stores its file and tells the person. */
export async function finalizeGenerating() {
  for (const row of await listGenerating()) {
    try {
      await check(row);
    } catch (error) {
      // A hiccup (network, 5xx) is retried on the next tick; the row stays "generating".
      console.error(`media ${row.id}: checking the render failed`, error instanceof Error ? error.message : error);
    }
  }
}

const g = globalThis as unknown as { __mediaTimer?: NodeJS.Timeout; __mediaTicking?: boolean };

/** Polls the database, so renders started before a restart are still finished afterwards. */
export function startMediaFinalizer() {
  if (g.__mediaTimer || !isElevenLabsConfigured()) return;
  const tick = async () => {
    if (g.__mediaTicking) return;
    g.__mediaTicking = true;
    try {
      await finalizeGenerating();
    } catch (error) {
      console.error("media finalizer failed", error);
    } finally {
      g.__mediaTicking = false;
    }
  };
  g.__mediaTimer = setInterval(tick, TICK_MS);
  g.__mediaTimer.unref();
  void tick();
  console.log("media finalizer started");
}
