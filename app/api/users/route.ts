import { getCurrentUser, unauthorized } from "@/lib/auth";
import { listUsers } from "@/lib/users";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return unauthorized();
  return Response.json({ me: me.id, users: await listUsers() });
}
