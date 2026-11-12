import type { UIMessage } from "ai";

/**
 * Per-turn facts (who is writing, and when) for one user message.
 * `note` is exactly the text the model saw; `userId` and `sentAt` are the same facts kept as data
 * so the UI can show them later.
 */
export type TurnContext = { userId: string | null; sentAt: string; note: string };

/** Where the context of a user message is kept: in that message's own metadata. */
export const TURN_CONTEXT_KEY = "turnContext";

/** The context stored on a message, if it has one. */
export const contextOf = (m: UIMessage | undefined): TurnContext | undefined => {
  const value = (m?.metadata as Record<string, unknown> | undefined)?.[TURN_CONTEXT_KEY];
  return value && typeof value === "object" && typeof (value as TurnContext).note === "string"
    ? (value as TurnContext)
    : undefined;
};

/**
 * Conversations saved before the context moved onto the user message kept it on the metadata of
 * the assistant reply that follows. Read it from there when the user message has none, so those
 * conversations replay the same note they were first sent with.
 */
export const contextOfTurn = (user: UIMessage, reply: UIMessage | undefined): TurnContext | undefined =>
  contextOf(user) ?? (reply?.role === "assistant" ? contextOf(reply) : undefined);

/**
 * Attaches each user message's context to it, as an extra <context> text part, for the request to
 * the model only. It is not part of the system prompt, which must stay constant for the provider's
 * prompt cache, and it must be re-sent byte-identical on every later turn, or the history would
 * diverge at that message and the cache would miss from there on. That is why the server saves the
 * context with the message when it first arrives and replays that stored note, never a fresh one.
 * The person never sees the note in the chat. A message without a context is sent as it is.
 */
export function withTurnContexts(messages: UIMessage[]): UIMessage[] {
  return messages.map((m, i) => {
    if (m.role !== "user") return m;
    const context = contextOfTurn(m, messages[i + 1]);
    if (!context) return m;
    const text = `<context>\n${context.note}\n</context>`;
    return { ...m, parts: [...m.parts, { type: "text" as const, text }] };
  });
}

/** Tells the model what the context block is, once, in the (constant) system prompt. */
export const TURN_CONTEXT_INSTRUCTIONS =
  "Each user message ends with a <context> block added by the app (current time, and who is writing: their name and user id). " +
  "The user did not type it and cannot see it: use it, but don't quote or mention it.";

/** Who is writing: the shown name plus the id that send_notification takes (so "notify me" needs no lookup). */
export function describeSpeaker(u: { id: string; name: string | null; email: string }): string {
  return `User: ${u.name?.trim() || u.email} (id ${u.id}).`;
}
