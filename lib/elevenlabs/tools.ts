import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { getMedia, listMedia, mediaUrl, saveMedia, startMedia } from "@/lib/media/store";
import { generateAndWait, isElevenLabsConfigured, searchVoices, startGeneration } from "./client";

/**
 * Tools for making video ads with ElevenLabs. The pipeline the model follows:
 *   write the spoken script -> generate_speech -> generate_image (the presenter) ->
 *   generate_talking_video (presenter + speech -> lip-synced video), which needs approval.
 * `generate_scene_video` is the one-step alternative (a Veo clip with its own speech and sound).
 * Everything is stored in the media library (Settings > Media) and referred to by id.
 */

export type AdToolContext = { threadId?: string };

const TTS_MODELS = ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"] as const;
const ttsModel = () => {
  const configured = process.env.ELEVENLABS_TTS_MODEL?.trim();
  return (TTS_MODELS as readonly string[]).includes(configured ?? "") ? configured! : "eleven_v3";
};
const IMAGE_MODEL = () => process.env.ELEVENLABS_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image";
const LIPSYNC_MODEL = "creatify-aurora";
const SCENE_MODEL = () => process.env.ELEVENLABS_SCENE_MODEL?.trim() || "veo-3.1-fast-generate-001";

const ref = (m: { id: string; kind: string; title: string; status?: string }) => ({
  mediaId: m.id,
  kind: m.kind,
  title: m.title,
  status: m.status ?? "ready",
  url: mediaUrl(m.id),
});

/** Loads a stored file the model named by id, checking it is the right kind and ready. */
async function requireMedia(id: string, kind: "audio" | "image") {
  const row = await getMedia(id);
  if (!row) throw new Error(t.mediaLibrary.errNotFound(id));
  if (row.kind !== kind) throw new Error(t.mediaLibrary.errWrongKind(id, kind, row.kind));
  if (row.status !== "ready" || !row.data) throw new Error(t.mediaLibrary.errNotReady(id));
  return row;
}

const base64 = (b: Buffer) => b.toString("base64");

export function makeAdTools(ctx: AdToolContext): Record<string, { tool: ToolSet[string]; requiresApproval: boolean; availableInScheduledRuns: boolean }> {
  if (!isElevenLabsConfigured()) return {};

  const listVoices = tool({
    description:
      "Search the ElevenLabs voices available for speech (name, gender/age/accent/language labels, description). " +
      "Use it to pick a voice for generate_speech. Leave 'search' empty for the account's default list.",
    inputSchema: z.object({
      search: z.string().max(100).optional().describe("Free text: a name, language, accent or style, e.g. 'hebrew female warm'."),
    }),
    execute: async ({ search }) => ({ voices: await searchVoices({ search, limit: 20 }) }),
  });

  const generateSpeech = tool({
    description:
      "Turn a script into spoken audio with ElevenLabs text to speech and save it to the media library. " +
      "Returns a mediaId to pass to generate_talking_video. Write only what is spoken: no stage directions, no emojis. " +
      "With the default model (Eleven v3) short audio tags such as [excited] or [whispers] steer the delivery. " +
      "Keep ads short: 15-30 seconds is about 40-90 Hebrew words.",
    inputSchema: z.object({
      script: z.string().min(1).max(3000).describe("The exact words to speak, in the language of the ad."),
      voiceId: z.string().min(1).describe("A voice id from list_voices."),
      title: z.string().min(1).max(120).describe("Short name for the file, written in Hebrew."),
      languageCode: z.string().length(2).optional().describe("ISO 639-1 code to force, e.g. 'he'. Omit to detect it from the text."),
    }),
    execute: async ({ script, voiceId, title, languageCode }) => {
      const model = ttsModel();
      const { data, mimeType } = await generateAndWait("text-to-speech", {
        model_id: model,
        text: script,
        voice: voiceId,
        ...(languageCode && model !== "eleven_multilingual_v2" ? { language_code: languageCode } : {}),
      });
      const id = await saveMedia({
        kind: "audio",
        title,
        prompt: script,
        mimeType,
        data,
        details: { model, voiceId, languageCode: languageCode ?? null },
        threadId: ctx.threadId,
      });
      return { ...ref({ id, kind: "audio", title }), characters: script.length };
    },
  });

  const generateImage = tool({
    description:
      "Generate an image with ElevenLabs and save it to the media library: use it for the presenter (the face that will speak) " +
      "of a talking video. The presenter should face the camera, be clearly visible from the waist up, with a closed or relaxed mouth and a simple background. " +
      "For Meta Reels/Stories use aspectRatio 9:16; for the feed use 1:1 or 4:5. Reuse an earlier presenter with list_media instead of making a new one when the ads should look consistent.",
    inputSchema: z.object({
      prompt: z.string().min(1).max(2000).describe("What the image shows, in English."),
      aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]).default("9:16"),
      title: z.string().min(1).max(120).describe("Short name for the file, written in Hebrew."),
    }),
    execute: async ({ prompt, aspectRatio, title }) => {
      const model = IMAGE_MODEL();
      const { data, mimeType } = await generateAndWait("image", { model_id: model, prompt, aspect_ratio: aspectRatio }, 90_000);
      const id = await saveMedia({
        kind: "image",
        title,
        prompt,
        mimeType,
        data,
        details: { model, aspectRatio },
        threadId: ctx.threadId,
      });
      return ref({ id, kind: "image", title });
    },
  });

  const listMediaTool = tool({
    description:
      "List files in the media library (audio, images, videos made earlier): id, kind, title, status (generating, ready, failed), the script or prompt it came from and when. " +
      "Use it to find an earlier presenter image or speech to reuse, and to check whether a video has finished rendering.",
    inputSchema: z.object({
      kind: z.enum(["audio", "image", "video"]).optional(),
      limit: z.number().int().min(1).max(50).default(15),
    }),
    execute: async ({ kind, limit }) =>
      (await listMedia({ kind, limit })).map((m) => ({
        ...ref(m),
        prompt: m.prompt,
        error: m.error,
        createdAt: m.createdAt.toISOString(),
      })),
  });

  const generateTalkingVideo = tool({
    description:
      "Make a lip-synced talking video: the presenter image comes alive and speaks the generated audio (ElevenLabs, Creatify Aurora). " +
      "Costs real money and takes a few minutes, so a person must approve it first; call it once, only after the speech and image exist, and do not retry if it is declined. " +
      "It returns immediately with a mediaId and status 'generating'; the person is notified when the video is ready, and it appears in Settings > Media. " +
      "The video's shape follows the image's aspect ratio and its length follows the audio.",
    inputSchema: z.object({
      audioMediaId: z.string().min(1).describe("mediaId of the speech from generate_speech."),
      imageMediaId: z.string().min(1).describe("mediaId of the presenter image."),
      title: z.string().min(1).max(120).describe("Name of the video, written in Hebrew."),
      script: z.string().min(1).max(3000).describe("The spoken words, copied from the speech. Shown to the person who approves."),
      resolution: z.enum(["480p", "720p"]).default("720p"),
    }),
    execute: async ({ audioMediaId, imageMediaId, title, script, resolution }) => {
      const [audio, image] = await Promise.all([requireMedia(audioMediaId, "audio"), requireMedia(imageMediaId, "image")]);
      const externalId = await startGeneration("video", {
        model_id: LIPSYNC_MODEL,
        audio: { type: "inline_base64", content_base64: base64(audio.data!), mime_type: audio.mimeType === "audio/wav" ? "audio/wav" : "audio/mpeg" },
        image: { type: "inline_base64", content_base64: base64(image.data!), mime_type: image.mimeType ?? "image/png" },
        resolution,
      });
      const id = await startMedia({
        kind: "video",
        title,
        prompt: script,
        externalId,
        details: { flow: "video", model: LIPSYNC_MODEL, resolution, audioMediaId, imageMediaId },
        threadId: ctx.threadId,
      });
      return { ...ref({ id, kind: "video", title, status: "generating" }), note: t.mediaLibrary.renderingNote };
    },
  });

  const generateSceneVideo = tool({
    description:
      "One-step alternative to the talking-video pipeline: generate a short video clip with sound from a single prompt (Google Veo 3.1, via ElevenLabs). " +
      "Put any spoken line in quotes inside the prompt and the model speaks it; the voice cannot be chosen and lip-sync/Hebrew quality is less predictable than generate_talking_video. " +
      "Clips are 4, 6 or 8 seconds. Costs real money, so a person must approve it first; call it once and do not retry if it is declined. " +
      "Returns a mediaId with status 'generating'; the person is notified when it is ready.",
    inputSchema: z.object({
      prompt: z.string().min(1).max(2000).describe("Scene, camera, mood and the quoted spoken line, in English."),
      title: z.string().min(1).max(120).describe("Name of the video, written in Hebrew."),
      aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
      durationSecs: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
      resolution: z.enum(["720p", "1080p"]).default("720p"),
    }),
    execute: async ({ prompt, title, aspectRatio, durationSecs, resolution }) => {
      const model = SCENE_MODEL();
      const externalId = await startGeneration("video", {
        model_id: model,
        prompt,
        aspect_ratio: aspectRatio,
        duration_secs: durationSecs,
        resolution,
        generate_audio: true,
      });
      const id = await startMedia({
        kind: "video",
        title,
        prompt,
        externalId,
        details: { flow: "video", model, aspectRatio, durationSecs, resolution },
        threadId: ctx.threadId,
      });
      return { ...ref({ id, kind: "video", title, status: "generating" }), note: t.mediaLibrary.renderingNote };
    },
  });

  return {
    list_voices: { tool: listVoices, requiresApproval: false, availableInScheduledRuns: true },
    generate_speech: { tool: generateSpeech, requiresApproval: false, availableInScheduledRuns: true },
    generate_image: { tool: generateImage, requiresApproval: false, availableInScheduledRuns: true },
    list_media: { tool: listMediaTool, requiresApproval: false, availableInScheduledRuns: true },
    // Video is the expensive step: it always asks. A scheduled run has nobody to ask (and a parked
    // approval can't be resumed yet), so it prepares the script, speech and image, and the video is
    // approved afterwards in the conversation that run saved.
    generate_talking_video: { tool: generateTalkingVideo, requiresApproval: true, availableInScheduledRuns: false },
    generate_scene_video: { tool: generateSceneVideo, requiresApproval: true, availableInScheduledRuns: false },
  };
}
