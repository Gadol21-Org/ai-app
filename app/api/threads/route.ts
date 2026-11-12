import { createThread, listThreads } from "@/lib/threads";
import { t } from "@/lib/i18n";

export async function GET() {
  return Response.json({ threads: await listThreads() });
}

export async function POST(req: Request) {
  const { id }: { id: string } = await req.json();
  if (typeof id !== "string" || !id || id.length > 64) {
    return Response.json({ error: t.errors.invalidId }, { status: 400 });
  }
  await createThread(id);
  return Response.json({ id });
}
