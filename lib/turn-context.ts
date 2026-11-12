import type { ModelMessage } from "ai";

/**
 * Per-turn facts (the time, who is writing) are attached to the newest user message rather than
 * the system prompt. Model providers cache the longest unchanged prefix of a request; a value that
 * changes every minute at the top of the system prompt would make every turn re-read the whole
 * conversation at full price. The note only exists in the request sent to the model: it is never
 * stored or shown in the chat.
 */
export function withTurnContext(messages: ModelMessage[], note: string): ModelMessage[] {
  const index = messages.findLastIndex((m) => m.role === "user");
  if (index === -1) return messages;
  const text = `<context>\n${note}\n</context>`;
  const target = messages[index] as Extract<ModelMessage, { role: "user" }>;
  const content =
    typeof target.content === "string"
      ? [{ type: "text" as const, text: target.content }, { type: "text" as const, text }]
      : [...target.content, { type: "text" as const, text }];
  return messages.map((m, i) => (i === index ? { ...target, content } : m));
}

/** Tells the model what the context block is, once, in the (constant) system prompt. */
export const TURN_CONTEXT_INSTRUCTIONS =
  "The newest user message ends with a <context> block added by the app (current time, and who is writing: their name and user id). " +
  "The user did not type it and cannot see it: use it, but don't quote or mention it.";

/** Who is writing, with the id the user tools (list_users, send_notification) expect. */
export function describeSpeaker(u: { id: string; name: string | null; email: string }): string {
  const name = u.name?.trim();
  return `Written by: ${name ? `${name} (${u.email})` : u.email}, user id ${u.id}.`;
}
