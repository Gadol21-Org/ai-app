import "server-only";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

type Db = MySql2Database<typeof schema>;

// Survive dev hot reloads without opening a new pool each time.
const globalForDb = globalThis as unknown as { __db?: Db };

/** Lazy so `next build` works without a database. */
export function getDb(): Db {
  if (!globalForDb.__db) {
    const uri = process.env.MYSQL_URL;
    if (!uri) throw new Error("MYSQL_URL is not set (see .env.example)");
    // A small pool: the free HeatWave instance is shared with other apps.
    const pool = mysql.createPool({ uri, connectionLimit: 5, timezone: "Z" });
    globalForDb.__db = drizzle(pool, { schema, mode: "default" });
  }
  return globalForDb.__db;
}

export { schema };
