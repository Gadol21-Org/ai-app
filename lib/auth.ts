import "server-only";
import { createPublicKey, createVerify } from "node:crypto";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const { users } = schema;

export type User = typeof users.$inferSelect;

/**
 * Who is making the request. The app sits behind Cloudflare Access, which authenticates people and
 * adds their email as `Cf-Access-Authenticated-User-Email` (the same approach as budget-tracking).
 *
 * That header is trusted because the container only listens on the VM's localhost, reachable only
 * through the Cloudflare tunnel. For defense in depth, set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD
 * to also verify the signed `Cf-Access-Jwt-Assertion` token, whose email must match the header.
 *
 * Outside production a missing header falls back to DEV_USER_EMAIL (default dev@localhost) so
 * local development works without Cloudflare. In production a missing header means no user.
 */
const EMAIL_HEADER = "cf-access-authenticated-user-email";
const JWT_HEADER = "cf-access-jwt-assertion";

const b64url = (s: string) => Buffer.from(s, "base64url");

type Jwks = { keys: (Record<string, unknown> & { kid: string })[] };
let jwksCache: { at: number; jwks: Jwks } | undefined;

async function getJwks(teamDomain: string, force = false): Promise<Jwks> {
  if (!force && jwksCache && Date.now() - jwksCache.at < 60 * 60 * 1000)
    return jwksCache.jwks;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Cloudflare Access certs: HTTP ${res.status}`);
  const jwks = (await res.json()) as Jwks;
  jwksCache = { at: Date.now(), jwks };
  return jwks;
}

/** Verifies a Cloudflare Access JWT (RS256) and returns its email, or null when it is not valid. */
export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<string | null> {
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const header = JSON.parse(b64url(h).toString());
    const claims = JSON.parse(b64url(p).toString());
    if (header.alg !== "RS256") return null;
    let key = (await getJwks(teamDomain)).keys.find(
      (k) => k.kid === header.kid,
    );
    // Keys rotate: refresh once when the key id is unknown.
    key ??= (await getJwks(teamDomain, true)).keys.find(
      (k) => k.kid === header.kid,
    );
    if (!key) return null;
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${p}`)
      .verify(createPublicKey({ key: key as never, format: "jwk" }), b64url(sig));
    if (!ok) return null;
    const auds: unknown[] = Array.isArray(claims.aud)
      ? claims.aud
      : [claims.aud];
    if (!auds.includes(aud)) return null;
    if (claims.iss !== `https://${teamDomain}`) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now())
      return null;
    return typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function resolveEmail(h: Headers): Promise<string | null> {
  const headerEmail = h.get(EMAIL_HEADER)?.trim().toLowerCase() || null;
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.CF_ACCESS_AUD;
  if (teamDomain && aud) {
    const token = h.get(JWT_HEADER);
    if (!token) return null;
    const jwtEmail = await verifyAccessJwt(token, teamDomain, aud);
    return jwtEmail && (!headerEmail || headerEmail === jwtEmail)
      ? jwtEmail
      : null;
  }
  if (headerEmail) return headerEmail;
  if (process.env.NODE_ENV !== "production")
    return (process.env.DEV_USER_EMAIL ?? "dev@localhost").toLowerCase();
  return null;
}

const SEEN_EVERY_MS = 60 * 1000;
const lastSeen = new Map<string, number>();

/** Creates the user the first time their email is seen; later visits only refresh `lastSeenAt`. */
export async function upsertUserByEmail(email: string): Promise<User> {
  const db = getDb();
  const now = Date.now();
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    await db
      .insert(users)
      .values({ id: crypto.randomUUID(), email })
      .onDuplicateKeyUpdate({ set: { email } });
    [user] = await db.select().from(users).where(eq(users.email, email));
  } else if (now - (lastSeen.get(email) ?? 0) > SEEN_EVERY_MS) {
    await db
      .update(users)
      .set({ lastSeenAt: sql`now(3)` })
      .where(eq(users.id, user.id));
  }
  lastSeen.set(email, now);
  return user;
}

/** The signed-in user for the current request, or null (use `unauthorized()` in API routes). */
export async function getCurrentUser(): Promise<User | null> {
  const email = await resolveEmail(await headers());
  return email ? upsertUserByEmail(email) : null;
}

export const unauthorized = () =>
  Response.json({ error: "Unauthorized" }, { status: 401 });

/** Shown name: the friendly name when set, otherwise the email. */
export const displayName = (u: Pick<User, "name" | "email">) =>
  u.name?.trim() || u.email;
