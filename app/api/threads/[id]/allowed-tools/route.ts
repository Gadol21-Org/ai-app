import { mcpToolRequiresApproval } from "@/lib/mcp";
import { getChatTools } from "@/lib/tools";
import { allowToolInThread, getAllowedTools, getThread } from "@/lib/threads";
import { t } from "@/lib/i18n";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return Response.json({ tools: await getAllowedTools((await params).id) });
}

/** "Allow in this conversation": this MCP tool stops asking in this conversation only. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { tool }: { tool?: unknown } = await req.json();
  if (!(await getThread(id))) return Response.json({ error: t.errors.notFound }, { status: 404 });
  // Loads the MCP tools first, so the check below knows which of them ask.
  await getChatTools();
  if (typeof tool !== "string" || !mcpToolRequiresApproval(tool))
    return Response.json({ error: t.errors.invalidMessage }, { status: 400 });
  await allowToolInThread(id, tool);
  return Response.json({ ok: true });
}
