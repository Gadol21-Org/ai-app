"use client";

import { useEffect } from "react";
import { OPEN_CONVERSATION_EVENT } from "@/lib/open-conversation-event";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // A notification was tapped while this page is open: the service worker sends the link here.
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "open-url" || typeof e.data.url !== "string") return;
      const url = new URL(e.data.url, location.origin);
      if (location.pathname === "/" && url.pathname === "/") {
        window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: e.data.url }));
      } else {
        location.assign(url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    if (process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
