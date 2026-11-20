"use client";

import {
  AssistantRuntimeProvider,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import {
  ScheduleTimezoneContext,
  ToolRenderer,
} from "@/components/assistant-ui/elements/add-schedule-tool.aui";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ThreadListSidebar } from "@/components/assistant-ui/elements/threadlist-sidebar.aui";
import { ModelSelector } from "@/components/assistant-ui/elements/model-selector";
import { getSelectedModel } from "@/lib/model-selection";
import { threadListAdapter } from "@/lib/chat-storage";
import { toChatRequest } from "@/lib/chat-request";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ResumeReply } from "@/components/resume-reply";
import { OpenConversation } from "@/components/open-conversation";
import { NotificationBell } from "@/components/notification-bell";
import { t } from "@/lib/i18n";

/**
 * The Stop button aborts the request, and that is the one thing that stops a reply on the server:
 * a connection that merely drops (app in the background) leaves it running. The abort is the only
 * signal the server can tell apart from a drop, so it is forwarded as an explicit stop.
 */
const stopOnAbort: typeof fetch = (input, init) => {
  const signal = init?.signal;
  const body = typeof init?.body === "string" ? init.body : "";
  if (init?.method === "POST" && signal && body) {
    try {
      const { threadId } = JSON.parse(body) as { threadId?: string };
      if (threadId) {
        signal.addEventListener(
          "abort",
          () => void fetch(`/api/chat/${encodeURIComponent(threadId)}/stop`, { method: "POST", keepalive: true }).catch(() => {}),
          { once: true },
        );
      }
    } catch {}
  }
  return fetch(input, init);
};

const useThreadRuntime = () =>
  useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      fetch: stopOnAbort,
      // A reply still running on the server is reconnected by the conversation's own id.
      prepareReconnectToStreamRequest: ({ body }) => ({
        api: `/api/chat/${encodeURIComponent(String((body as { threadId?: string } | undefined)?.threadId ?? ""))}/stream`,
      }),
      // The model picked in the composer, resolved when each message is sent.
      body: () => ({ model: getSelectedModel() }),
      prepareSendMessagesRequest: ({ id, messages, body }) => ({
        body: toChatRequest({ id, messages, body }),
      }),
    }),
    // Once the person answers an approval card, send the conversation back so the tool runs.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

export const Assistant = ({ timezone }: { timezone: string }) => {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useThreadRuntime,
    adapter: threadListAdapter,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <OpenConversation />
      <ResumeReply />
      <ScheduleTimezoneContext.Provider value={timezone}>
        <SidebarProvider>
          <div className="app-shell flex w-full">
            <ThreadListSidebar />
            <SidebarInset>
              <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)]">
                <SidebarTrigger />
                <h1 className="text-sm font-medium">{t.appName}</h1>
                <NotificationBell />
              </header>
              <div className="flex-1 overflow-hidden">
                <Thread components={{ ToolFallback: ToolRenderer, ComposerExtra: ModelSelector }} />
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </ScheduleTimezoneContext.Provider>
    </AssistantRuntimeProvider>
  );
};
