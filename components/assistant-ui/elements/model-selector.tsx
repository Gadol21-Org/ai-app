"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { CheckIcon, ChevronDownIcon, SparklesIcon } from "lucide-react";
import { useEffect, type FC } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHAT_MODEL_OPTIONS, DEFAULT_CHAT_MODEL } from "@/lib/model-catalog";
import { setSelectedModel, useSelectedModel } from "@/lib/model-selection";
import { t } from "@/lib/i18n";

/** Picks the model for this conversation. The choice is saved with the conversation. */
export const ModelSelector: FC = () => {
  const aui = useAui();
  const selected = useSelectedModel();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const option =
    CHAT_MODEL_OPTIONS.find((m) => m.id === selected) ?? CHAT_MODEL_OPTIONS[0];

  // Opening a conversation shows the model it uses; a new one starts on the default.
  useEffect(() => {
    if (!remoteId) {
      setSelectedModel(DEFAULT_CHAT_MODEL);
      return;
    }
    let stale = false;
    fetch(`/api/threads/${remoteId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((thread: { model?: string | null } | null) => {
        if (!stale) setSelectedModel(thread?.model ?? DEFAULT_CHAT_MODEL);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [remoteId]);

  const choose = (id: string) => {
    setSelectedModel(id);
    const threadId = aui.threadListItem().getState().remoteId;
    if (threadId) {
      fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: id }),
      }).catch(() => {});
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-7 gap-1 rounded-full px-2 text-xs"
            aria-label={t.chat.modelSelect}
          />
        }
      >
        <SparklesIcon className="size-3.5" />
        <span dir="ltr">{option.shortLabel}</span>
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t.chat.modelSelect}</DropdownMenuLabel>
          {CHAT_MODEL_OPTIONS.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onClick={() => choose(m.id)}
              className="justify-between gap-2"
            >
              <span className="flex flex-col">
                <span>{m.label}</span>
                <span className="text-muted-foreground text-xs">
                  {m.id === DEFAULT_CHAT_MODEL
                    ? t.chat.modelDefaultHint
                    : t.chat.modelStrongerHint}
                </span>
              </span>
              {m.id === selected ? <CheckIcon className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
