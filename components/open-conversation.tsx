"use client";

import { useAui } from "@assistant-ui/react";
import { useEffect } from "react";
import { OPEN_CONVERSATION_EVENT } from "@/lib/open-conversation-event";


/** Opens the conversation in `?thread=` (and focuses the tool call in `?call=`), as set by notification links. */
function readTarget(search: string) {
  const params = new URLSearchParams(search);
  const thread = params.get("thread");
  return thread ? { thread, call: params.get("call") } : null;
}

function focusToolCall(call: string) {
  // The conversation loads asynchronously, and tool calls sit inside collapsed groups: keep looking,
  // opening one closed group per tick until the call shows up.
  const opened = new WeakSet<Element>();
  let tries = 0;
  const timer = setInterval(() => {
    const el = document.querySelector(`[data-tool-call-id="${CSS.escape(call)}"]`);
    if (el) {
      clearInterval(timer);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("ring-2", "ring-primary", "transition-shadow");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 3000);
      return;
    }
    const closed = [...document.querySelectorAll('[data-slot="tool-group-trigger"][aria-expanded="false"]')].find(
      (g) => !opened.has(g),
    );
    if (closed) {
      opened.add(closed);
      (closed as HTMLElement).click();
    }
    if (++tries > 40) clearInterval(timer);
  }, 250);
}

/** Lives inside the assistant runtime so it can switch conversations. */
export function OpenConversation() {
  const aui = useAui();
  useEffect(() => {
    const open = async (target: { thread: string; call: string | null }) => {
      await aui.threads().switchToThread(target.thread);
      if (target.call) focusToolCall(target.call);
    };
    // Opened from a notification while the app was closed: the target is in the URL.
    const initial = readTarget(window.location.search);
    if (initial) {
      history.replaceState(null, "", "/");
      void open(initial).catch(() => {});
    }
    // Notification tapped while the app is already open: the service worker tells the page.
    const onEvent = (e: Event) => {
      const url = (e as CustomEvent<string>).detail;
      const target = readTarget(new URL(url, location.origin).search);
      if (target) void open(target).catch(() => {});
    };
    window.addEventListener(OPEN_CONVERSATION_EVENT, onEvent);
    return () => window.removeEventListener(OPEN_CONVERSATION_EVENT, onEvent);
  }, [aui]);
  return null;
}
