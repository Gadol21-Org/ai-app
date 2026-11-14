import "server-only";
import { google } from "@ai-sdk/google";
import { generateText, type ToolSet } from "ai";
import { getChatModel, getChatModelId, modelProviderOptions } from "@/lib/models";

/**
 * Gemini's built-in Google grounding, billed by Google as free for us (we count it, at $0).
 *
 * Google Search runs inside the chat request itself, next to our own function tools; the model decides
 * per turn whether to search. Google Maps can share the request with Search on the models listed in
 * NATIVE_SEARCH_AND_MAPS (Interactions API only; the others reject the pair with "cannot be combined"),
 * so there Maps is native too. On every other model Maps is the `ask_google_maps` tool (lib/tools.ts),
 * which makes its own small Maps-grounded call and hands the answer back.
 */

/** Models verified to accept Search and Maps in one Interactions request. */
const NATIVE_SEARCH_AND_MAPS = new Set(["google:gemini-3.8-flash", "google:gemini-3.6-flash"]);

export const hasNativeMaps = (modelId: string) => NATIVE_SEARCH_AND_MAPS.has(modelId);

/** The chat tools plus the provider-executed grounding tools that suit the model. */
export function withGrounding(tools: ToolSet, modelId: string): ToolSet {
  if (!modelId.startsWith("google:")) return tools;
  if (!hasNativeMaps(modelId)) return { ...tools, google_search: google.tools.googleSearch({}) };
  // Native Maps replaces the fallback tool, so the model sees one way to look at places.
  const { ask_google_maps: _fallback, ...rest } = tools;
  return { ...rest, google_search: google.tools.googleSearch({}), google_maps: google.tools.googleMaps({}) };
}

type StepLike = {
  usage?: { raw?: unknown };
  content?: readonly { type: string; toolName?: string; providerExecuted?: boolean; input?: unknown }[];
};

/**
 * Google Search queries and Maps lookups across the steps of a call. Prefers Google's own count
 * (`grounding_tool_count` in the Interactions usage); otherwise counts the provider-executed tool calls.
 */
export function countGrounding(steps: readonly StepLike[]): { searchQueries: number; mapsCalls: number } {
  let searchQueries = 0;
  let mapsCalls = 0;
  for (const step of steps) {
    const counts = (step.usage?.raw as { grounding_tool_count?: { type?: string | null; count?: number | null }[] | null } | undefined)
      ?.grounding_tool_count;
    if (counts?.length) {
      for (const c of counts) {
        if (c.type === "google_search") searchQueries += c.count ?? 0;
        else if (c.type === "google_maps") mapsCalls += c.count ?? 0;
      }
      continue;
    }
    for (const part of step.content ?? []) {
      if (part.type !== "tool-call" || !part.providerExecuted) continue;
      if (part.toolName?.includes("google_search")) {
        const queries = (part.input as { queries?: unknown[] } | undefined)?.queries;
        searchQueries += Array.isArray(queries) && queries.length > 0 ? queries.length : 1;
      } else if (part.toolName?.includes("google_maps")) mapsCalls += 1;
    }
  }
  return { searchQueries, mapsCalls };
}

export type MapsAnswer = {
  answer: string;
  places: { title: string; url: string }[];
  usage: Awaited<ReturnType<typeof generateText>>["usage"];
};

/** One Maps-grounded question (places, hours, ratings, directions-style facts). */
export async function askGoogleMaps(
  question: string,
  near?: { latitude: number; longitude: number },
): Promise<MapsAnswer> {
  const result = await generateText({
    model: getChatModel(getChatModelId()),
    system:
      "Answer using Google Maps data. Be concise and factual; give names, addresses, ratings and opening hours when known. Reply in the language of the question.",
    prompt: question,
    tools: { google_maps: google.tools.googleMaps({}) },
    providerOptions: near
      ? { google: { retrievalConfig: { latLng: near } } }
      : undefined,
  });
  const places = result.sources.flatMap((s) =>
    s.sourceType === "url" ? [{ title: s.title ?? s.url, url: s.url }] : [],
  );
  return { answer: result.text, places, usage: result.usage };
}
