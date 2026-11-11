"use client";

import {
  useAui,
  type GenericThreadHistoryAdapter,
  type MessageFormatAdapter,
  type MessageStorageEntry,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useMemo } from "react";

/**
 * Connects assistant-ui's thread list and message history to our own backend
 * (/api/threads, stored in MySQL) so conversations survive reloads and are
 * shared across devices.
 */

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/threads${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} /api/threads${path}: ${res.status}`);
  return res.json();
}

type ThreadRow = {
  id: string;
  title: string | null;
  status: "regular" | "archived";
  kind: "chat" | "schedule";
  lastMessageAt: string;
};

/** `externalId` of threads created by a scheduled run. */
export const SCHEDULE_THREAD = "schedule";

const toMetadata = (t: ThreadRow) => ({
  remoteId: t.id,
  status: t.status,
  title: t.title ?? undefined,
  // The sidebar tells scheduled conversations apart by this marker.
  externalId: t.kind === "schedule" ? SCHEDULE_THREAD : undefined,
  lastMessageAt: new Date(t.lastMessageAt),
});

const patch = (id: string, body: object) =>
  api(`/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(() => {});

/** Message history of the thread currently mounted, read and written through the API. */
function useThreadHistory(): ThreadHistoryAdapter {
  const aui = useAui();
  return useMemo(() => {
    // Resolved on every call: the thread gets its id when its first message is sent.
    const existingId = () => aui.threadListItem().getState().remoteId;
    const ensureId = async () => (await aui.threadListItem().initialize()).remoteId;

    return {
      // Only the formatted adapter below is used by the AI SDK runtime.
      load: async () => ({ messages: [] }),
      append: async () => {},

      withFormat<TMessage, TStorage extends Record<string, unknown>>(
        format: MessageFormatAdapter<TMessage, TStorage>,
      ): GenericThreadHistoryAdapter<TMessage> {
        const save = async (item: Parameters<typeof format.encode>[0]) => {
          const id = await ensureId();
          const entry: MessageStorageEntry<TStorage> = {
            id: format.getId(item.message),
            parent_id: item.parentId,
            format: format.format,
            content: format.encode(item),
          };
          await api(`/${id}/messages`, { method: "PUT", body: JSON.stringify(entry) });
        };

        return {
          async load() {
            const id = existingId();
            if (!id) return { messages: [] };
            const { messages } = await api<{ messages: MessageStorageEntry<TStorage>[] }>(
              `/${id}/messages?format=${encodeURIComponent(format.format)}`,
            );
            return { messages: messages.map((m) => format.decode(m)) };
          },
          append: save,
          update: save,
          async delete(items) {
            const id = existingId();
            if (!id) return;
            const ids = items.map((i) => format.getId(i.message));
            await api(`/${id}/messages`, { method: "DELETE", body: JSON.stringify({ ids }) });
          },
        };
      },
    };
  }, [aui]);
}

export const threadListAdapter: RemoteThreadListAdapter = {
  async list() {
    const { threads } = await api<{ threads: ThreadRow[] }>("");
    return { threads: threads.map(toMetadata) };
  },
  async fetch(id) {
    return toMetadata(await api<ThreadRow>(`/${id}`));
  },
  async initialize() {
    const id = crypto.randomUUID();
    await api("", { method: "POST", body: JSON.stringify({ id }) });
    return { remoteId: id, externalId: undefined };
  },
  rename: (id, title) => patch(id, { title }),
  archive: (id) => patch(id, { status: "archived" }),
  unarchive: (id) => patch(id, { status: "regular" }),
  delete: (id) => api(`/${id}`, { method: "DELETE" }).then(() => {}),

  /** The server names the conversation with the chat model and saves the title. */
  async generateTitle(id, messages) {
    const text = messages
      .map((m) => {
        const parts = m.content.flatMap((c) => (c.type === "text" ? [c.text] : []));
        return `${m.role}: ${parts.join(" ")}`;
      })
      .join("\n");
    return createAssistantStream(async (controller) => {
      const { title } = await api<{ title: string }>(`/${id}/title`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      controller.appendText(title);
    });
  },

  unstable_useAdapters: function useAdapters() {
    const history = useThreadHistory();
    return useMemo(() => ({ history }), [history]);
  },
};
