import { getCurrentUser, unauthorized } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { setUserName } from "@/lib/users";

/** Anyone in the family can name anyone (the app only admits people Cloudflare Access let in). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getCurrentUser())) return unauthorized();
  const { name } = await req.json();
  if (typeof name !== "string")
    return Response.json({ error: t.errors.invalidMessage }, { status: 400 });
  const found = await setUserName((await params).id, name);
  return found
    ? Response.json({ ok: true })
    : Response.json({ error: t.errors.notFound }, { status: 404 });
}
