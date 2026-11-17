import { getCurrentUser, unauthorized } from "@/lib/auth";
import { resolveNames } from "@/lib/meta/names";

export const dynamic = "force-dynamic";

const list = (value: string | null) => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);

/** `?meta=<ids>&media=<ids>` -> `{ names: { id: name } }`; ids that can't be resolved are left out. */
export async function GET(req: Request) {
  if (!(await getCurrentUser())) return unauthorized();
  const url = new URL(req.url);
  const names = await resolveNames({ meta: list(url.searchParams.get("meta")), media: list(url.searchParams.get("media")) });
  return Response.json({ names }, { headers: { "cache-control": "private, max-age=60" } });
}
