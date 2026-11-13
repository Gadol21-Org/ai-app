/** Where the app opens a conversation (and focuses one of its tool calls). */
export function conversationUrl(threadId: string, toolCallId?: string) {
  const params = new URLSearchParams({ thread: threadId });
  if (toolCallId) params.set("call", toolCallId);
  return `/?${params}`;
}
