import "server-only";
import { google } from "@ai-sdk/google";
import { generateText, type ToolSet } from "ai";
import { getChatModel, getChatModelId } from "@/lib/models";

/**
 * Gemini's built-in Google grounding, billed by Google as free for us (we count it, at $0).
 *
 * Google Search runs inside the chat request itself: Gemini 3+ allows it next to our own function
 * tools (the SDK sends `includeServerSideToolInvocations`), and the model decides per turn whether
 * to search. Google Maps grounding cannot share a request with Google Search ("cannot be combined"),
 * so Maps is a normal tool (`ask_google_maps`, see lib/tools.ts) that makes its own small
 * Maps-grounded call and hands the answer back.
 */

/** The provider-executed tools added to every chat and scheduled-run model call. */
export function groundingTools(modelId: string): ToolSet {
  if (!modelId.startsWith("google:")) return {};
  return { google_search: google.tools.googleSearch({}) };
}

type StepLike = { providerMetadata?: unknown };

/** How many Google Search queries the model ran across the steps of a call (from Gemini's grounding metadata). */
export function countSearchQueries(steps: readonly StepLike[]): number {
  let total = 0;
  for (const step of steps) {
    const meta = (
      step.providerMetadata as
        | {
            google?: {
              groundingMetadata?: { webSearchQueries?: string[] | null } | null;
            };
          }
        | undefined
    )?.google?.groundingMetadata;
    total += meta?.webSearchQueries?.length ?? 0;
  }
  return total;
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
