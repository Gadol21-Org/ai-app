import type { UIMessage } from "ai";

/**
 * The server keeps the conversation, so a chat request carries only what is new: the message just
 * written (and the message it follows, which picks the branch when a message was edited), or the
 * user message to answer again, or the answers to approval cards. Never the history.
 * The matching reader is app/api/chat/route.ts.
 */
export function toChatRequest({
  id,
  messages,
  trigger,
  body,
}: {
  id: string;
  messages: UIMessage[];
  trigger: "submit-message" | "regenerate-message";
  body?: object;
}) {
  const model = (body as { model?: unknown } | undefined)?.model;
  const last = messages.at(-1);
  if (trigger === "regenerate-message") return { threadId: id, model, trigger, parentId: last?.id };
  if (last?.role === "assistant") {
    // Continuing a reply after Allow/Deny: the answers, for the assistant message that asked.
    const approvals = last.parts.flatMap((part) =>
      "state" in part && part.state === "approval-responded" && "approval" in part
        ? [{ id: part.approval.id, approved: part.approval.approved, reason: part.approval.reason }]
        : [],
    );
    return { threadId: id, model, assistantMessageId: last.id, approvals };
  }
  return { threadId: id, model, message: last, parentId: messages.at(-2)?.id ?? null };
}
