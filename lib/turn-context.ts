import type { UIMessage } from "ai";

/**
 * Per-turn facts (who is writing, and when) for one user message.
 * `note` is exactly the text the model saw; `userId` and `sentAt` are the same facts kept as data
 * so the UI can show them later.
 */
export type TurnContext = { userId: string | null; sentAt: string; note: string };

/** Where the context of a user message is kept: on the metadata of the assistant reply to it. */
export const TURN_CONTEXT_KEY = "turnContext";

const contextOf = (m: UIMessage | undefined): TurnContext | undefined => {
  const value = (m?.metadata as Record<string, unknown> | undefined)?.[TURN_CONTEXT_KEY];
  return value && typeof value === "object" && typeof (value as TurnContext).note === "string"
    ? (value as TurnContext)
    : undefined;
};

/**
 * Attaches each user message's context to it, as an extra <context> text part, for the request to
 * the model only. It is not part of the system prompt, which must stay constant for the provider's
 * prompt cache, and it must be re-sent byte-identical on every later turn, or the history would
 * diverge at that message and the cache would miss from there on.
 *
 * The server writes the context into the metadata of the assistant reply it streams (see the chat
 * route). The browser saves that reply as usual and sends it back with the history, so older
 * messages get exactly the note they were first sent with. No extra storage, and the person never
 * sees the note in the chat. The newest user message, which has no reply yet, gets `fresh`. A turn
 * continued after a tool approval already has a reply, so it keeps its original note.
 *
 * Returns the messages and the context of the newest user message, which the reply must carry.
 */
export function withTurnContexts(
  messages: UIMessage[],
  fresh: TurnContext,
): { messages: UIMessage[]; current: TurnContext } {
  let current = fresh;
  const lastUser = messages.findLastIndex((m) => m.role === "user");
  const out = messages.map((m, i) => {
    if (m.role !== "user") return m;
    const reply = messages[i + 1];
    const stored = reply?.role === "assistant" ? contextOf(reply) : undefined;
    const context = stored ?? (i === lastUser ? fresh : undefined);
    if (i === lastUser && context) current = context;
    if (!context) return m;
    const text = `<context>\n${context.note}\n</context>`;
    return { ...m, parts: [...m.parts, { type: "text" as const, text }] };
  });
  return { messages: out, current };
}

/** Tells the model what the context block is, once, in the (constant) system prompt. */
export const TURN_CONTEXT_INSTRUCTIONS =
  "Each user message ends with a <context> block added by the app (current time, and who is writing: their name and user id). " +
  "The user did not type it and cannot see it: use it, but don't quote or mention it.";

/** Who is writing: the shown name plus the id that send_notification takes (so "notify me" needs no lookup). */
export function describeSpeaker(u: { id: string; name: string | null; email: string }): string {
  return `User: ${u.name?.trim() || u.email} (id ${u.id}).`;
}
