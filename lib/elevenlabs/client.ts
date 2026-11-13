import "server-only";

/**
 * Thin client for the ElevenLabs "flows" generation API: text to speech, images and videos are all
 * asynchronous jobs (`POST /v1/flows/<kind>` returns an id, `GET /v1/flows/<kind>/<id>` reports its
 * status and, once completed, a signed download URL). Docs: https://elevenlabs.io/docs/api-reference/flows
 */

export type FlowKind = "text-to-speech" | "image" | "video";

/** What the API key needs: text_to_speech, voices_read and image_video_generation. */
export const isElevenLabsConfigured = () => !!process.env.ELEVENLABS_API_KEY?.trim();

// Accounts with data residency use another host, e.g. https://api.eu.residency.elevenlabs.io
const baseUrl = () => (process.env.ELEVENLABS_API_BASE?.trim() || "https://api.elevenlabs.io").replace(/\/+$/, "");

export class ElevenLabsError extends Error {}

/** Turns the API's error bodies ({detail: {message}} or {detail: [{msg}]}) into one sentence. */
function describeError(status: number, body: string) {
  try {
    const detail = JSON.parse(body)?.detail;
    const text = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => d?.msg).join("; ") : detail?.message;
    if (text) return `ElevenLabs (${status}): ${text}`;
  } catch {}
  return `ElevenLabs (${status}): ${body.slice(0, 300) || "no details"}`;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new ElevenLabsError("ELEVENLABS_API_KEY is not set.");
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { "xi-api-key": key, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new ElevenLabsError(describeError(res.status, await res.text()));
  return (await res.json()) as T;
}

export type Voice = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  labels: Record<string, string>;
  previewUrl: string | null;
};

export async function searchVoices(opts: { search?: string; limit?: number }): Promise<Voice[]> {
  const params = new URLSearchParams({ page_size: String(opts.limit ?? 20) });
  if (opts.search) params.set("search", opts.search);
  const data = await call<{ voices: Array<Record<string, unknown>> }>(`/v2/voices?${params}`);
  return (data.voices ?? []).map((v) => ({
    id: String(v.voice_id),
    name: String(v.name),
    category: (v.category as string) ?? null,
    description: (v.description as string) ?? null,
    labels: (v.labels as Record<string, string>) ?? {},
    previewUrl: (v.preview_url as string) ?? null,
  }));
}

/** Starts a generation and returns its id. `body` is the request for that kind (it includes `model_id`). */
export async function startGeneration(kind: FlowKind, body: Record<string, unknown>): Promise<string> {
  const res = await call<{ id: string }>(`/v1/flows/${kind}`, { method: "POST", body: JSON.stringify(body) });
  return res.id;
}

export type GenerationStatus =
  | { status: "pending" | "generating" }
  | { status: "completed"; contentUrl: string; mimeType: string }
  | { status: "failed"; reason: string; message: string };

export async function getGeneration(kind: FlowKind, id: string): Promise<GenerationStatus> {
  const res = await call<Record<string, string>>(`/v1/flows/${kind}/${encodeURIComponent(id)}`);
  if (res.status === "completed")
    return { status: "completed", contentUrl: res.content_url, mimeType: res.content_mime_type };
  if (res.status === "failed")
    return { status: "failed", reason: res.failure_reason, message: res.error_message ?? res.failure_reason };
  return { status: res.status === "pending" ? "pending" : "generating" };
}

/** The signed URL expires after about an hour, so call this soon after the generation completes. */
export async function downloadContent(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new ElevenLabsError(`Downloading the result failed (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

/** Waits for a quick generation (speech, image) and returns its bytes. */
export async function generateAndWait(
  kind: FlowKind,
  body: Record<string, unknown>,
  timeoutMs = 45_000,
): Promise<{ data: Buffer; mimeType: string; generationId: string }> {
  const generationId = await startGeneration(kind, body);
  const deadline = Date.now() + timeoutMs;
  for (let delay = 700; Date.now() < deadline; delay = Math.min(delay * 1.4, 3000)) {
    await new Promise((r) => setTimeout(r, delay));
    const state = await getGeneration(kind, generationId);
    if (state.status === "completed")
      return { data: await downloadContent(state.contentUrl), mimeType: state.mimeType, generationId };
    if (state.status === "failed") throw new ElevenLabsError(`ElevenLabs could not generate it (${state.reason}): ${state.message}`);
  }
  throw new ElevenLabsError("ElevenLabs took too long to answer. Try again.");
}

/**
 * Speech with Eleven v4 (and v3). v4 is served by the text-to-dialogue endpoint, which answers
 * synchronously with the audio itself; one input is plain single-voice speech.
 */
export async function synthesizeDialogue(opts: {
  text: string;
  voiceId: string;
  model: string;
  languageCode?: string;
}): Promise<{ data: Buffer; mimeType: string }> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new ElevenLabsError("ELEVENLABS_API_KEY is not set.");
  const res = await fetch(`${baseUrl()}/v1/text-to-dialogue?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      model_id: opts.model,
      inputs: [{ text: opts.text, voice_id: opts.voiceId }],
      ...(opts.languageCode ? { language_code: opts.languageCode } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new ElevenLabsError(describeError(res.status, await res.text()));
  return { data: Buffer.from(await res.arrayBuffer()), mimeType: "audio/mpeg" };
}
