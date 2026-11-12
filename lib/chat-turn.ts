import "server-only";
import type { UIMessage } from "ai";
import { contextOf, TURN_CONTEXT_KEY, type TurnContext } from "@/lib/turn-context";
import { toUIMessage, type StoredMessage } from "@/lib/threads";
export type { ChatRequest } from "@/lib/chat-request";

export class BadChatRequest extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/** The new user message as the browser sent it, reduced to what a person can type: text and files. */
export function parseUserMessage(raw: unknown, context: TurnContext): UIMessage {
  const m = raw as { id?: unknown; role?: unknown; parts?: unknown } | null;
  if (!m || m.role !== "user" || !isId(m.id) || !Array.isArray(m.parts)) throw new BadChatRequest("Invalid message.");
  const parts = m.parts.filter(
    (p): p is UIMessage["parts"][number] =>
      !!p && typeof p === "object" && ((p as { type?: unknown }).type === "text" || (p as { type?: unknown }).type === "file"),
  );
  if (parts.length === 0) throw new BadChatRequest("Invalid message.");
  return { id: m.id, role: "user", parts, metadata: { [TURN_CONTEXT_KEY]: context } };
}

export type ApprovalAnswer = { id: string; approved: boolean; reason?: string };

export function parseApprovals(raw: unknown): ApprovalAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a) =>
    a && typeof a.id === "string" && typeof a.approved === "boolean"
      ? [{ id: a.id, approved: a.approved, ...(typeof a.reason === "string" ? { reason: a.reason } : {}) }]
      : [],
  );
}

/**
 * Records the person's answers on the stored approval cards of an assistant message, so the turn
 * continues in that same message. Only cards still waiting are changed: an answer can't rewrite
 * one already given. Returns undefined when no answer matched a waiting card.
 */
export function applyApprovals(message: UIMessage, answers: ApprovalAnswer[]): UIMessage | undefined {
  let applied = 0;
  const parts = message.parts.map((part) => {
    if (!("state" in part) || part.state !== "approval-requested" || !("approval" in part)) return part;
    const answer = answers.find((a) => a.id === part.approval.id);
    if (!answer) return part;
    applied++;
    return {
      ...part,
      state: "approval-responded" as const,
      approval: { id: answer.id, approved: answer.approved, ...(answer.reason ? { reason: answer.reason } : {}) },
    };
  }) as UIMessage["parts"];
  return applied > 0 ? { ...message, parts } : undefined;
}

/**
 * An approval card the person ignored (they typed a message instead of tapping Allow or Deny)
 * counts as a denial, so the model is told the call did not run rather than left with a dangling
 * request. Only for the request to the model: the stored message keeps showing the card.
 */
export function denyUnansweredApprovals(messages: UIMessage[]): UIMessage[] {
  if (messages.at(-1)?.role !== "user") return messages;
  return messages.map((m) => ({
    ...m,
    parts: m.parts.map((part) =>
      "state" in part && part.state === "approval-requested" && "approval" in part
        ? {
            ...part,
            state: "approval-responded" as const,
            approval: { id: part.approval.id, approved: false, reason: "The user replied instead of approving." },
          }
        : part,
    ),
  })) as UIMessage[];
}

/**
 * A reply that was cut short (the person pressed Stop, the connection dropped, or the model
 * failed) is saved as far as it got, tidied so it can be sent to the model again: text is closed,
 * half-streamed tool inputs are dropped, and a tool that never reported back is marked cancelled.
 * Returns undefined when nothing worth keeping was produced.
 */
export function settlePartialReply(message: UIMessage): UIMessage | undefined {
  const parts = message.parts.flatMap((part) => {
    if ((part.type === "text" || part.type === "reasoning") && part.state === "streaming") return [{ ...part, state: "done" as const }];
    if ("state" in part && "toolCallId" in part) {
      if (part.state === "input-streaming") return [];
      if (part.state === "input-available")
        return [{ ...part, state: "output-error" as const, errorText: "Cancelled before it finished." }];
    }
    return [part];
  }) as UIMessage["parts"];
  const hasContent = parts.some((p) => p.type !== "step-start");
  return hasContent ? { ...message, parts } : undefined;
}

/**
 * The context to keep on a user message that has none of its own (a conversation saved before
 * the context moved onto the message): the one a reply to it carried, else a fresh one.
 */
export function backfillContext(all: StoredMessage[], userMessage: UIMessage, fresh: TurnContext): TurnContext {
  const reply = all.find((s) => s.parent_id === userMessage.id && s.content.role === "assistant" && contextOf(toUIMessage(s)));
  return contextOf(reply && toUIMessage(reply)) ?? fresh;
}
