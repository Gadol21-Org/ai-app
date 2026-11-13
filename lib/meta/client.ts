import "server-only";

/**
 * Thin client for the parts of Meta's Marketing (Graph) API that Meta's official Ads MCP server
 * (https://mcp.facebook.com/ads, wired up in lib/mcp.ts) can't do: it only accepts creatives as
 * public URLs, while our generated videos live in the media library. Everything else (reading
 * insights, creating and changing campaigns, ad sets and ads) goes through that MCP server.
 */

export const isMetaConfigured = () =>
  !!process.env.META_ADS_ACCESS_TOKEN?.trim() && !!process.env.META_AD_ACCOUNT_ID?.trim();

const version = () => process.env.META_GRAPH_VERSION?.trim() || "v25.0";

/** "act_123" or "123" -> "act_123". */
export const adAccountId = () => {
  const id = process.env.META_AD_ACCOUNT_ID?.trim() ?? "";
  return id.startsWith("act_") ? id : `act_${id}`;
};

export class MetaError extends Error {}

function describeError(status: number, body: string) {
  try {
    const e = JSON.parse(body)?.error;
    if (e?.message)
      return `Meta (${status}): ${e.error_user_msg ?? e.message}${e.code ? ` [code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""}]` : ""}`;
  } catch {}
  return `Meta (${status}): ${body.slice(0, 300) || "no details"}`;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.META_ADS_ACCESS_TOKEN?.trim();
  if (!token) throw new MetaError("META_ADS_ACCESS_TOKEN is not set.");
  const res = await fetch(`https://graph.facebook.com/${version()}${path}`, {
    ...init,
    // The token goes in a header, never in a URL that could end up in a log.
    headers: { authorization: `Bearer ${token}`, ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  if (!res.ok) throw new MetaError(describeError(res.status, text));
  return JSON.parse(text) as T;
}

/** Uploads a video to the ad account's library and returns its id (it is processed asynchronously). */
export async function uploadVideo(opts: { data: Buffer; mimeType: string; title: string }): Promise<string> {
  const form = new FormData();
  form.set("source", new Blob([new Uint8Array(opts.data)], { type: opts.mimeType }), "ad.mp4");
  form.set("title", opts.title);
  const res = await call<{ id: string }>(`/${adAccountId()}/advideos`, { method: "POST", body: form });
  return res.id;
}

export type VideoState = { status: "processing" | "ready" | "error"; thumbnailUrl: string | null };

export async function getVideoState(videoId: string): Promise<VideoState> {
  const res = await call<{
    status?: { video_status?: string };
    thumbnails?: { data?: Array<{ uri: string; is_preferred?: boolean }> };
  }>(`/${encodeURIComponent(videoId)}?fields=status,thumbnails`);
  const status = res.status?.video_status;
  const thumbs = res.thumbnails?.data ?? [];
  return {
    status: status === "ready" ? "ready" : status === "error" ? "error" : "processing",
    thumbnailUrl: (thumbs.find((t) => t.is_preferred) ?? thumbs[0])?.uri ?? null,
  };
}

export type VideoAdInput = {
  name: string;
  adSetId: string;
  pageId: string;
  videoId: string;
  thumbnailUrl: string;
  message: string;
  headline?: string;
  linkUrl: string;
  callToAction: string;
};

/** Creates the creative and an ad that is always PAUSED; turning it on is a separate, approved step. */
export async function createPausedVideoAd(input: VideoAdInput): Promise<{ creativeId: string; adId: string }> {
  const account = adAccountId();
  const creative = await call<{ id: string }>(`/${account}/adcreatives`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      object_story_spec: {
        page_id: input.pageId,
        video_data: {
          video_id: input.videoId,
          image_url: input.thumbnailUrl,
          message: input.message,
          ...(input.headline ? { title: input.headline } : {}),
          call_to_action: { type: input.callToAction, value: { link: input.linkUrl } },
        },
      },
    }),
  });
  const ad = await call<{ id: string }>(`/${account}/ads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      adset_id: input.adSetId,
      creative: { creative_id: creative.id },
      status: "PAUSED",
    }),
  });
  return { creativeId: creative.id, adId: ad.id };
}
