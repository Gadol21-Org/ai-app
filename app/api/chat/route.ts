import { convertToModelMessages, generateId, isStepCount, pruneMessages, streamText, type UIMessage } from "ai";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getChatModel, resolveChatModelId } from "@/lib/models";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { describeNow, scheduleTimezone } from "@/lib/schedules/timing";
import { getChatTools, getToolApproval } from "@/lib/tools";
import {
  getAllowedTools,
  getThread,
  listUIMessages,
  pickBranch,
  saveUIMessage,
  toUIMessage,
  updateThread,
} from "@/lib/threads";
import { recordUsage } from "@/lib/usage";
import {
  TURN_CONTEXT_INSTRUCTIONS,
  TURN_CONTEXT_KEY,
  contextOf,
  describeSpeaker,
  withTurnContexts,
  type TurnContext,
} from "@/lib/turn-context";
import {
  BadChatRequest,
  applyApprovals,
  backfillContext,
  denyUnansweredApprovals,
  parseApprovals,
  parseUserMessage,
  settlePartialReply,
  type ChatRequest,
} from "@/lib/chat-turn";
import { t } from "@/lib/i18n";

export const maxDuration = 60;

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;

/**
 * One chat turn. The server owns the conversation: it loads the history from the database,
 * saves the new user message (with its turn context) before calling the model, and saves the
 * reply when the stream ends, or as far as it got if the stream is cut short.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body: ChatRequest = await req.json();
  const { threadId } = body;
  if (!isId(threadId)) return Response.json({ error: t.errors.invalidId }, { status: 400 });
  if (!(await getThread(threadId))) return Response.json({ error: t.errors.notFound }, { status: 404 });

  const modelId = resolveChatModelId(body.model);
  // Remember the pick so reopening the conversation shows (and keeps using) the same model.
  await updateThread(threadId, { model: modelId }).catch(() => {});

  // Who is writing and when: kept on the user message, then replayed byte-identical on every
  // later turn so the prompt cache stays warm.
  const fresh: TurnContext = {
    userId: user.id,
    sentAt: new Date().toISOString(),
    note: `Current time: ${describeNow(scheduleTimezone())}.\n${describeSpeaker(user)}`,
  };

  let history: UIMessage[];
  // Where the reply hangs: the message this turn continues (after an approval) keeps its own parent.
  let replyParentId: string | null;
  try {
    const all = await listUIMessages(threadId);
    const stored = (id: unknown) => all.find((m) => m.id === id);
    const branchTo = (id: string | null) => {
      const branch = pickBranch(all, id);
      if (!branch) throw new BadChatRequest("Unknown message.");
      return branch.map(toUIMessage);
    };

    // The browser says which messages it is showing. Everything before the last one must be
    // exactly the branch the server has saved; the last one decides what this turn is.
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isId)) throw new BadChatRequest("Invalid request.");
    const lastId = ids[ids.length - 1];
    const parentId = ids.length > 1 ? ids[ids.length - 2] : null;
    const saved = parentId === null ? [] : pickBranch(all, parentId)?.map((m) => m.id);
    if (!saved || saved.join() !== ids.slice(0, -1).join())
      throw new BadChatRequest("The conversation on screen is out of sync with the saved one. Reload it.", 409);
    const existing = stored(lastId);
    if (existing && existing.parent_id !== parentId)
      throw new BadChatRequest("The conversation on screen is out of sync with the saved one. Reload it.", 409);

    if (existing && toUIMessage(existing).role === "assistant") {
      // The person answered approval cards: continue the assistant message that asked.
      const branch = branchTo(existing.id);
      const updated = applyApprovals(branch.at(-1)!, parseApprovals(body.approvals));
      if (!updated) throw new BadChatRequest("Nothing is waiting for that answer.", 409);
      replyParentId = existing.parent_id;
      history = [...branch.slice(0, -1), updated];
    } else if (existing) {
      // A user message the server already has: answer it again (regenerate), or a retry of a send.
      // The old reply, if any, stays as another branch. Context stays as it was first saved.
      history = branchTo(existing.id);
      replyParentId = existing.id;
      const asked = history.at(-1)!;
      if (!contextOf(asked)) {
        // A conversation from before the context lived on the user message: keep it there from now on.
        const withContext = { ...asked, metadata: { ...(asked.metadata as object), [TURN_CONTEXT_KEY]: backfillContext(all, asked, fresh) } };
        await saveUIMessage(threadId, withContext, existing.parent_id);
        history = [...history.slice(0, -1), withContext];
      }
    } else {
      // A new user message.
      const message = parseUserMessage(body.message, fresh);
      if (message.id !== lastId) throw new BadChatRequest("Invalid message.");
      history = [...branchTo(parentId), message];
      await saveUIMessage(threadId, message, parentId);
      replyParentId = message.id;
    }
  } catch (error) {
    if (error instanceof BadChatRequest) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }

  const tools = await getChatTools(threadId);
  const allowedTools = await getAllowedTools(threadId);

  const result = streamText({
    abortSignal: req.signal,
    model: getChatModel(modelId),
    // Constant, so the provider's prompt cache can reuse it and the conversation after it.
    system: `${SYSTEM_PROMPT}\n\n${TURN_CONTEXT_INSTRUCTIONS} When a tool call is not approved, do not retry it.`,
    messages: pruneMessages({
      // Old tool calls and their (possibly big) results are not re-sent to the model every turn.
      messages: await convertToModelMessages(withTurnContexts(denyUnansweredApprovals(history)), {
        ignoreIncompleteToolCalls: true,
      }),
      toolCalls: "before-last-4-messages",
    }),
    tools,
    toolApproval: getToolApproval(tools, allowedTools),
    // Building a trip means many tool calls in a row.
    stopWhen: isStepCount(10),
    onFinish: ({ totalUsage }) =>
      recordUsage({
        threadId,
        userId: user.id,
        kind: "chat",
        modelId,
        usage: totalUsage,
      }),
  });

  return result.toUIMessageStreamResponse({
    // With the history given, the reply continues the approval's message, or is a new one whose
    // id the browser learns from the stream (it must match the saved row).
    originalMessages: history,
    generateMessageId: generateId,
    // Also called when the stream is cut short, so a reply stopped half way is still kept.
    onEnd: async ({ responseMessage, outcome }) => {
      const message = outcome.status === "completed" ? responseMessage : settlePartialReply(responseMessage);
      if (!message) return;
      try {
        await saveUIMessage(threadId, message, replyParentId);
        replyParentId = message.id;
      } catch (error) {
        console.error("saving the reply failed", error);
      }
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
}
