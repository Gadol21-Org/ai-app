import { getCurrentUser, unauthorized } from "@/lib/auth";
import { saveMedia, mediaUrl } from "@/lib/media/store";
import { t } from "@/lib/i18n";

const MAX_BYTES = 15 * 1024 * 1024;

/** The real type of an image from its first bytes, not from what the browser claims. */
function sniff(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

/** Saves an uploaded photo of the person who presents the ads (multipart: `file`, optional `name`). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: t.mediaLibrary.uploadNoFile }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: t.mediaLibrary.uploadTooBig }, { status: 413 });
  const data = Buffer.from(await file.arrayBuffer());
  const mimeType = sniff(data);
  if (!mimeType) return Response.json({ error: t.mediaLibrary.uploadBadType }, { status: 415 });
  const name = String(form?.get("name") ?? "").trim().slice(0, 100) || t.mediaLibrary.presenterDefaultName;
  const id = await saveMedia({
    kind: "image",
    title: name,
    mimeType,
    data,
    details: { presenter: true, generated: false, uploadedBy: user.id },
  });
  return Response.json({ id, url: mediaUrl(id) });
}
