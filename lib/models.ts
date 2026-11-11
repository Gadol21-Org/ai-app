import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

/**
 * Single place that decides which model answers a chat request.
 *
 * The id is `provider:model`. Only the Google provider is registered for now;
 * to add another provider (Anthropic, OpenAI, ...) install its @ai-sdk package
 * and add one entry to `providers`. Nothing else in the app needs to change.
 */
const providers: Record<string, (modelId: string) => LanguageModel> = {
  google: (modelId) => google(modelId),
};

export const DEFAULT_CHAT_MODEL = "google:gemini-3.8-flash";

export function getChatModel(spec = process.env.CHAT_MODEL ?? DEFAULT_CHAT_MODEL) {
  const [provider, ...rest] = spec.split(":");
  const create = providers[provider];
  if (!create || rest.length === 0) {
    throw new Error(
      `Invalid CHAT_MODEL "${spec}". Use "<provider>:<model>", e.g. ${DEFAULT_CHAT_MODEL}. Known providers: ${Object.keys(providers).join(", ")}`,
    );
  }
  return create(rest.join(":"));
}
