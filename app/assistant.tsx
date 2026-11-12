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
import { threadListAdapter } from "@/lib/chat-storage";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { t } from "@/lib/i18n";

const useThreadRuntime = () =>
  useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
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
      <ScheduleTimezoneContext.Provider value={timezone}>
        <SidebarProvider>
          <div className="flex h-dvh w-full">
            <ThreadListSidebar />
            <SidebarInset>
              <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)]">
                <SidebarTrigger />
                <h1 className="text-sm font-medium">{t.appName}</h1>
              </header>
              <div className="flex-1 overflow-hidden">
                <Thread components={{ ToolFallback: ToolRenderer }} />
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </ScheduleTimezoneContext.Provider>
    </AssistantRuntimeProvider>
  );
};
