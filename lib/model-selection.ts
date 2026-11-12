"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_CHAT_MODEL, isSelectableModel } from "@/lib/model-catalog";

/**
 * The model picked for the conversation that is open. A tiny external store so the composer's
 * selector and the chat transport (which sends it with each message) stay in step.
 */
let current = DEFAULT_CHAT_MODEL;
const listeners = new Set<() => void>();

export const getSelectedModel = () => current;

export function setSelectedModel(id: string) {
  const next = isSelectableModel(id) ? id : DEFAULT_CHAT_MODEL;
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

export const useSelectedModel = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    getSelectedModel,
    () => DEFAULT_CHAT_MODEL,
  );
