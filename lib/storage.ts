import "server-only";
import { sql } from "drizzle-orm";
import type { RowDataPacket } from "mysql2";
import { getDb, getPool, schema } from "@/lib/db";

export type TableSize = { table: string; rows: number; dataBytes: number; indexBytes: number };

/**
 * Size of this app's database as MySQL reports it: data plus indexes of every
 * table, in bytes. MySQL 8 caches these figures for up to 24 hours, so the cache
 * is switched off for this one connection to read them live. (MariaDB, used only
 * for local testing, has no cache and no such setting.)
 */
export async function getDatabaseSize() {
  const conn = await getPool().getConnection();
  try {
    try {
      await conn.query("SET SESSION information_schema_stats_expiry = 0");
    } catch {
      // Not MySQL 8: nothing to switch off.
    }
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS name, TABLE_ROWS AS tableRows, DATA_LENGTH AS dataBytes, INDEX_LENGTH AS indexBytes
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY DATA_LENGTH + INDEX_LENGTH DESC`,
    );
    const tables: TableSize[] = rows.map((r) => ({
      table: r.name,
      rows: Number(r.tableRows),
      dataBytes: Number(r.dataBytes),
      indexBytes: Number(r.indexBytes),
    }));
    return {
      totalBytes: tables.reduce((n, t) => n + t.dataBytes + t.indexBytes, 0),
      tables,
    };
  } finally {
    conn.release();
  }
}

/** Bytes of message content stored per conversation (the text itself, without index overhead). */
export async function getConversationSizes() {
  const rows = await getDb()
    .select({
      threadId: schema.messages.threadId,
      bytes: sql<string>`sum(octet_length(cast(${schema.messages.content} as char)))`.mapWith(Number),
      messages: sql<string>`count(*)`.mapWith(Number),
    })
    .from(schema.messages)
    .groupBy(schema.messages.threadId);
  return new Map(rows.map((r) => [r.threadId, { bytes: r.bytes, messages: r.messages }]));
}
