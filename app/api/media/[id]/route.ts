import { getCurrentUser, unauthorized } from "@/lib/auth";
import { deleteMedia, getMedia } from "@/lib/media/store";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const extensions: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** The stored file, with Range support so video and audio can be seeked. `?download=1` saves it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return unauthorized();
  const { id } = await params;
  const row = await getMedia(id);
  if (!row?.data || row.status !== "ready") return Response.json({ error: t.errors.notFound }, { status: 404 });

  const mime = row.mimeType ?? "application/octet-stream";
  const data = row.data;
  const headers = new Headers({
    "content-type": mime,
    "accept-ranges": "bytes",
    // Private to the family; the id is a random UUID and the file never changes.
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  });
  if (new URL(req.url).searchParams.get("download")) {
    const ext = extensions[mime] ?? "bin";
    // RFC 5987: the title may be Hebrew.
    const name = `${row.title.replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "media"}.${ext}`;
    headers.set("content-disposition", `attachment; filename="media.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, data.length - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : data.length - 1;
    end = Math.min(end, data.length - 1);
    if (start > end || start >= data.length) {
      headers.set("content-range", `bytes */${data.length}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("content-range", `bytes ${start}-${end}/${data.length}`);
    headers.set("content-length", String(end - start + 1));
    return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers });
  }
  headers.set("content-length", String(data.length));
  return new Response(new Uint8Array(data), { headers });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return unauthorized();
  const { id } = await params;
  await deleteMedia(id);
  return Response.json({ deleted: true });
}
