import type { UIMessage } from "ai";

/**
 * What the browser sends to /api/chat. The server keeps the conversation, so the request carries
 * no history, only the ids of the messages the person is looking at (`ids`, oldest first, which is
 * all the AI SDK promises about `messages`: the conversation so far) plus what is new:
 * - a message the server hasn't seen: the new user message, as `message`, or
 * - a last id the server already has: when it is a user message, the person wants it answered
 *   again; when it is an assistant message, they answered its approval cards (`approvals`).
 * The server checks `ids` against its own saved branch, so a browser that has drifted from it
 * gets an error instead of a reply saved on the wrong branch. The reader is app/api/chat/route.ts.
 */
export type ChatRequest = {
  threadId: string;
  model?: unknown;
  ids: string[];
  message?: UIMessage;
  approvals?: { id: string; approved: boolean; reason?: string }[];
};

export function toChatRequest({
  id,
  messages,
  body,
}: {
  id: string;
  messages: UIMessage[];
  body?: object;
}): ChatRequest {
  const model = (body as { model?: unknown } | undefined)?.model;
  const last = messages.at(-1);
  const request: ChatRequest = { threadId: id, model, ids: messages.map((m) => m.id) };
  if (last?.role === "user") request.message = last;
  if (last?.role === "assistant") {
    // Answers to the approval cards of the reply that asked.
    request.approvals = last.parts.flatMap((part) =>
      "state" in part && part.state === "approval-responded" && "approval" in part
        ? [{ id: part.approval.id, approved: part.approval.approved, reason: part.approval.reason }]
        : [],
    );
  }
  return request;
}
