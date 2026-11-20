import { google } from "@ai-sdk/google";
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from "ai";
import { DEFAULT_CHAT_MODEL, isSelectableModel } from "@/lib/model-catalog";

/**
 * Single place that decides which model answers a chat request.
 *
 * The id is `provider:model`. Only the Google provider is registered for now;
 * to add another provider (Anthropic, OpenAI, ...) install its @ai-sdk package
 * and add one entry to `providers`. Nothing else in the app needs to change.
 */
const providers: Record<string, (modelId: string) => Exclude<LanguageModel, string>> = {
  google: (modelId) => google(modelId),
};

/**
 * Per-model default settings (applied to chats, titles and scheduled runs alike). Models not listed
 * here keep the provider's own defaults.
 */
const modelDefaults: Record<string, Parameters<typeof defaultSettingsMiddleware>[0]["settings"]> = {
  "google:gemini-3.5-flash-lite": {
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "medium" } } },
  },
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
  const model = create(rest.join(":"));
  const settings = modelDefaults[spec];
  return settings ? wrapLanguageModel({ model, middleware: defaultSettingsMiddleware({ settings }) }) : model;
}

/** The model for a chat request: the person's pick when it is a known option, else the default. */
export function resolveChatModelId(requested?: unknown) {
  return isSelectableModel(requested) ? requested : getChatModelId();
}
