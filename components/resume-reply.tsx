"use client";

import { useAui, useAuiState } from "@assistant-ui/react";
import { useAISDKChat } from "@assistant-ui/ai-sdk";
import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";

const FORMAT = "ai-sdk/v6";

type Stored = { id: string; parent_id: string | null; content: UIMessage };

/**
 * A reply is written by the server whether or not the browser stays connected, but a phone that
 * backgrounds the app drops the connection, and the chat would show a failure. This brings the
 * conversation back to what the server has: the finished reply if it is saved, else the reply
 * still being written (replayed, then followed live).
 *
 * Runs when a conversation opens or reloads showing a question without an answer, and when the
 * app comes back to the foreground (or the network returns) after a failed stream.
 */
export function ResumeReply() {
  const chat = useAISDKChat();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const lastId = useAuiState((s) => s.thread.messages.at(-1)?.id);
  const lastRole = useAuiState((s) => s.thread.messages.at(-1)?.role);
  const loading = useAuiState((s) => s.thread.isLoading);

  const chatRef = useRef(chat);
  chatRef.current = chat;
  const busy = useRef(false);
  const tried = useRef("");

  const recover = useRef(async () => {});
  recover.current = async () => {
    const c = chatRef.current;
    if (!c || !remoteId || busy.current) return;
    if (c.status === "submitted" || c.status === "streaming") return;
    const last = c.messages.at(-1);
    if (!last) return;
    // Only a question without its answer, or a stream that broke half way, can be missing a reply.
    if (last.role !== "user" && c.status !== "error") return;
    busy.current = true;
    try {
      const res = await fetch(`/api/threads/${remoteId}/messages?format=${encodeURIComponent(FORMAT)}`);
      if (res.ok) {
        const { messages: saved } = (await res.json()) as { messages: Stored[] };
        const done =
          last.role === "user"
            ? saved.findLast((m) => m.parent_id === last.id && m.content.role === "assistant")
            : saved.find((m) => m.id === last.id);
        if (done) {
          // The reply finished while the app was away: show the saved one.
          c.setMessages(last.role === "user" ? [...c.messages, done.content] : [...c.messages.slice(0, -1), done.content]);
          c.clearError();
          return;
        }
      }
      // Still being written (or not at all: the server then answers 204 and nothing changes).
      await c.resumeStream({ body: { threadId: remoteId } });
    } catch {
      // Offline or the server is restarting: the next return to the app tries again.
    } finally {
      busy.current = false;
    }
  };

  // A conversation opened (or reloaded) while its reply is still being written.
  useEffect(() => {
    if (loading || !remoteId || lastRole !== "user") return;
    const key = `${remoteId}:${lastId}`;
    if (tried.current === key) return;
    tried.current = key;
    const timer = setTimeout(() => void recover.current(), 400);
    return () => clearTimeout(timer);
  }, [loading, remoteId, lastId, lastRole]);

  // Back in the foreground, or back online.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible") void recover.current();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", back);
    window.addEventListener("pageshow", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("online", back);
      window.removeEventListener("pageshow", back);
    };
  }, []);

  return null;
}
