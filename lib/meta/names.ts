import "server-only";
import { getMediaSummary } from "@/lib/media/store";
import { getObjectNames, isMetaConfigured } from "./client";

/**
 * Resolves the ids in an approval card to the names people know (campaign, ad set, ad, Page, video
 * title). This is done here, not by the model: the model works with ids, and the card shows names.
 */
const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; name: string }>();

export const META_ID = /^\d{5,25}$/;
export const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveNames(opts: { meta: string[]; media: string[] }): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const now = Date.now();

  const wanted: string[] = [];
  for (const id of new Set(opts.meta.filter((i) => META_ID.test(i)).slice(0, 20))) {
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL_MS) out[id] = hit.name;
    else wanted.push(id);
  }
  if (wanted.length && isMetaConfigured()) {
    const found = await getObjectNames(wanted).catch(() => ({}) as Record<string, string>);
    for (const [id, name] of Object.entries(found)) {
      cache.set(id, { at: now, name });
      out[id] = name;
    }
  }

  await Promise.all(
    [...new Set(opts.media.filter((i) => MEDIA_ID.test(i)).slice(0, 20))].map(async (id) => {
      const row = await getMediaSummary(id).catch(() => undefined);
      if (row?.title) out[id] = row.title;
    }),
  );
  return out;
}
