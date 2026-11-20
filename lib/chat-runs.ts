import "server-only";
import type { UIMessageChunk } from "ai";

/**
 * A model reply being produced on the server. It runs on its own, not tied to the browser's request:
 * a phone that backgrounds the app drops the connection, but the reply keeps going and is saved when
 * it ends. Every chunk is kept so a browser that comes back can replay it from the start
 * (GET /api/chat/:id/stream) and carry on following it live.
 */
export class ChatRun {
  readonly chunks: UIMessageChunk[] = [];
  done = false;
  /** Aborted by the Stop button (POST /api/chat/:id/stop), never by a dropped connection. */
  readonly controller = new AbortController();
  private waiters = new Set<() => void>();

  push(chunk: UIMessageChunk) {
    this.chunks.push(chunk);
    this.wake();
  }

  finish() {
    this.done = true;
    this.wake();
  }

  private wake() {
    const waiters = [...this.waiters];
    this.waiters.clear();
    for (const w of waiters) w();
  }

  /** The chunks so far, then the live ones, until the run ends. Each caller gets its own stream. */
  stream(): ReadableStream<UIMessageChunk> {
    let next = 0;
    return new ReadableStream<UIMessageChunk>({
      pull: async (controller) => {
        while (next >= this.chunks.length && !this.done) await new Promise<void>((r) => this.waiters.add(r));
        if (next < this.chunks.length) controller.enqueue(this.chunks[next++]);
        else controller.close();
      },
    });
  }
}

/** A run that is stopped by the server itself if nothing ends it (a hung model call). */
const MAX_RUN_MS = 15 * 60_000;
/** How long a finished run stays replayable: long enough for a browser that was away to catch up. */
const KEEP_FINISHED_MS = 2 * 60_000;

// One process serves the app, so the registry lives in memory (and survives dev hot reloads).
const globalForRuns = globalThis as unknown as { __chatRuns?: Map<string, ChatRun> };
const runs = (globalForRuns.__chatRuns ??= new Map());

export const getRun = (threadId: string) => runs.get(threadId);
export const isRunning = (threadId: string) => runs.get(threadId)?.done === false;

/** Starts a run for the thread, or returns undefined when one is already going. */
export function startRun(threadId: string): ChatRun | undefined {
  if (isRunning(threadId)) return undefined;
  const run = new ChatRun();
  runs.set(threadId, run);
  const limit = setTimeout(() => run.controller.abort(new Error("The reply took too long.")), MAX_RUN_MS);
  limit.unref();
  return run;
}

/** Marks the run over and forgets it a little later. */
export function endRun(threadId: string, run: ChatRun) {
  run.finish();
  const timer = setTimeout(() => {
    if (runs.get(threadId) === run) runs.delete(threadId);
  }, KEEP_FINISHED_MS);
  timer.unref();
}

export function stopRun(threadId: string) {
  const run = runs.get(threadId);
  if (!run || run.done) return false;
  run.controller.abort();
  return true;
}
