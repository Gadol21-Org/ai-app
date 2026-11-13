import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { getMedia } from "@/lib/media/store";
import { t } from "@/lib/i18n";
import type { AgentTool } from "@/lib/tools";
import { createPausedVideoAd, getVideoState, isMetaConfigured, uploadVideo } from "./client";

/**
 * Tools that connect the media library to Meta ads. Reading performance and creating/changing
 * campaigns, ad sets and ads is Meta's official Ads MCP server (see lib/mcp.ts); these two cover
 * what it can't: getting a generated video into the ad account and building an ad from it.
 * Both change the ad account, so both always ask first, and the ad is created PAUSED.
 */
export function makeMetaAdTools(): Record<string, AgentTool> {
  if (!isMetaConfigured()) return {};

  const uploadAdVideo = tool({
    description:
      "Upload a video from the media library (list_media) to the Meta ad account's video library and return its Meta video id. " +
      "Does not create an ad. Asks the person first. Call it once and do not retry if it is declined.",
    inputSchema: z.object({
      mediaId: z.string().min(1).describe("Media library id of a ready video."),
      title: z.string().min(1).max(120).describe("Name for the video in Meta, written in Hebrew."),
    }),
    execute: async ({ mediaId, title }) => {
      const row = await getMedia(mediaId);
      if (!row) throw new Error(t.mediaLibrary.errNotFound(mediaId));
      if (row.kind !== "video") throw new Error(t.mediaLibrary.errWrongKind(mediaId, "video", row.kind));
      if (row.status !== "ready" || !row.data) throw new Error(t.mediaLibrary.errNotReady(mediaId));
      const videoId = await uploadVideo({ data: row.data, mimeType: row.mimeType ?? "video/mp4", title });
      return { metaVideoId: videoId, note: "Meta processes the video for a minute or two; create_video_ad waits for it." };
    },
  });

  const createVideoAd = tool({
    description:
      "Create a video ad from a Meta video id (upload_ad_video) inside an existing ad set (find ad sets with the ads_* tools). " +
      "The ad is ALWAYS created PAUSED so nothing spends; turning it on is a separate step (ads_activate_entity) that asks again. " +
      "Asks the person first, showing the copy and destination. Call it once and do not retry if it is declined.",
    inputSchema: z.object({
      metaVideoId: z.string().min(1),
      adSetId: z.string().min(1).describe("Ad set to put the ad in."),
      pageId: z.string().min(1).describe("Facebook Page the ad runs as (ads_get_pages_for_business)."),
      name: z.string().min(1).max(120),
      message: z.string().min(1).max(2000).describe("Primary text above the video."),
      headline: z.string().max(100).optional(),
      linkUrl: z.string().url().describe("Where the call-to-action button leads."),
      callToAction: z
        .enum(["LEARN_MORE", "SHOP_NOW", "SIGN_UP", "CONTACT_US", "BOOK_TRAVEL", "GET_QUOTE", "WHATSAPP_MESSAGE", "MESSAGE_PAGE", "ORDER_NOW", "APPLY_NOW"])
        .default("LEARN_MORE"),
    }),
    execute: async (input) => {
      // The thumbnail only exists once Meta has processed the video.
      let state = await getVideoState(input.metaVideoId);
      for (let i = 0; i < 24 && state.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        state = await getVideoState(input.metaVideoId);
      }
      if (state.status === "error") throw new Error("Meta could not process the video.");
      if (state.status !== "ready" || !state.thumbnailUrl)
        throw new Error("Meta is still processing the video. Try again in a minute.");
      const { creativeId, adId } = await createPausedVideoAd({ ...input, videoId: input.metaVideoId, thumbnailUrl: state.thumbnailUrl });
      return { adId, creativeId, status: "PAUSED" };
    },
  });

  return {
    upload_ad_video: { tool: uploadAdVideo, requiresApproval: true, availableInScheduledRuns: true },
    create_video_ad: { tool: createVideoAd, requiresApproval: true, availableInScheduledRuns: true },
  };
}
