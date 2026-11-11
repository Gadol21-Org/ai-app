import { createThread, listThreads } from "@/lib/threads";

export async function GET() {
  return Response.json({ threads: await listThreads() });
}

export async function POST(req: Request) {
  const { id }: { id: string } = await req.json();
  if (typeof id !== "string" || !id || id.length > 64) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  await createThread(id);
  return Response.json({ id });
}
