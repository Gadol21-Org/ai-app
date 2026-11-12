/**
 * The models a person can pick in the chat. Plain data (no server imports) so the composer's
 * selector and the server share one list. Ids are `provider:model`; the model part is the Gemini
 * API model id (verified against the public models list).
 */
export type ChatModelOption = { id: string; label: string; shortLabel: string };

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    id: "google:gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    shortLabel: "3.5 Flash Lite",
  },
  {
    id: "google:gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    shortLabel: "3.8 Flash",
  },
  {
    id: "google:gemini-4-hydrogen",
    label: "Gemini 4 Hydrogen",
    shortLabel: "4 Hydrogen",
  },
];

export const DEFAULT_CHAT_MODEL = CHAT_MODEL_OPTIONS[0].id;

export function isSelectableModel(id: unknown): id is string {
  return typeof id === "string" && CHAT_MODEL_OPTIONS.some((m) => m.id === id);
}
