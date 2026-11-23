import { createUIMessageStreamResponse } from "ai";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getRun } from "@/lib/chat-runs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Reconnect to a reply that is still being written (or just finished): replays what it produced so
 * far, then follows it live. 204 when the thread has no run, so the browser reads the saved reply.
 */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await getCurrentUser())) return unauthorized();
  const run = getRun((await params).id);
  if (!run) return new Response(null, { status: 204 });
  return createUIMessageStreamResponse({ stream: run.stream() });
}
