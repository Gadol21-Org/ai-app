import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const { users } = schema;

export const MAX_NAME_LENGTH = 80;

export function listUsers() {
  return getDb().select().from(users).orderBy(asc(users.createdAt));
}

/** An empty name clears it, so the email is shown again. Returns false when the user doesn't exist. */
export async function setUserName(id: string, name: string) {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  await getDb()
    .update(users)
    .set({ name: trimmed || null })
    .where(eq(users.id, id));
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id));
  return Boolean(row);
}
