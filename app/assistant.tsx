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
import { OpenConversation } from "@/components/open-conversation";
import { NotificationBell } from "@/components/notification-bell";
import { t } from "@/lib/i18n";

const useThreadRuntime = () =>
  useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
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
