import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { DEFAULT_CHAT_MODEL, isSelectableModel } from "@/lib/model-catalog";

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

/**
 * The default `provider:model` id (CHAT_MODEL overrides it). Used for new conversations, titles and
 * scheduled runs; also the key used for pricing and spend records.
 */
export function getChatModelId() {
  return process.env.CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
}

export function getChatModel(spec = getChatModelId()) {
  const [provider, ...rest] = spec.split(":");
  const create = providers[provider];
  if (!create || rest.length === 0) {
    throw new Error(
      `Invalid CHAT_MODEL "${spec}". Use "<provider>:<model>", e.g. ${DEFAULT_CHAT_MODEL}. Known providers: ${Object.keys(providers).join(", ")}`,
    );
  }
  return create(rest.join(":"));
}

/** The model for a chat request: the person's pick when it is a known option, else the default. */
export function resolveChatModelId(requested?: unknown) {
  return isSelectableModel(requested) ? requested : getChatModelId();
}
