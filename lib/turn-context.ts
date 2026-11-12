import type { UIMessage } from "ai";

/**
 * Per-turn facts (the time, who is writing) are attached to the user message they came with, as an
 * extra <context> text part, rather than to the system prompt. Model providers cache the longest
 * unchanged prefix of a request, so two things matter:
 *  - nothing that changes every minute may sit at the top of the system prompt, and
 *  - once a message has been sent with its note, every later request must send it again with
 *    the exact same note. Otherwise the history diverges at that message and the cache misses
 *    from there on. The notes are therefore stored per message (see `turnContexts`) and replayed.
 * The note is never stored in the chat itself or shown in it.
 */
export function withTurnContexts(messages: UIMessage[], notes: Map<string, string>): UIMessage[] {
  return messages.map((m) => {
    const note = m.role === "user" ? notes.get(m.id) : undefined;
    return note === undefined
      ? m
      : { ...m, parts: [...m.parts, { type: "text" as const, text: `<context>\n${note}\n</context>` }] };
  });
}

/** Tells the model what the context block is, once, in the (constant) system prompt. */
export const TURN_CONTEXT_INSTRUCTIONS =
  "The newest user message ends with a <context> block added by the app (current time, and who is writing: their name and user id). " +
  "The user did not type it and cannot see it: use it, but don't quote or mention it.";

/** Who is writing: the shown name plus the id that send_notification takes (so "notify me" needs no lookup). */
export function describeSpeaker(u: { id: string; name: string | null; email: string }): string {
  return `User: ${u.name?.trim() || u.email} (id ${u.id}).`;
}
