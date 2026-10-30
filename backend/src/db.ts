import pg from "pg";
import { translateDbError } from "./lib/errors";

// Keep timestamps as JavaScript Dates in UTC, and bigint columns as numbers:
// every id in this schema is far below the safe integer limit.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
// A date column is a calendar date, not an instant: keep it as "1990-05-24" so
// it cannot drift a day when it crosses a time zone.
pg.types.setTypeParser(1082, (v) => v);

export type Db = pg.Pool;
export type Conn = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase requires TLS; its pooler presents a certificate the default
    // Node trust store does not recognise, so verification is relaxed only there.
    ssl: /supabase\.(co|com)/.test(connectionString) ? { rejectUnauthorized: false } : undefined
  });
  pool.on("error", (e) => console.error("[db] idle client error:", e.message));
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  conn: Conn,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    const result = await conn.query<T>(text, params as never[]);
    return result.rows;
  } catch (e) {
    throw translateDbError(e) ?? e;
  }
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  conn: Conn,
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(conn, text, params);
  return rows[0] ?? null;
}

/**
 * Runs the work in one transaction, naming who is doing it. The database's own
 * audit trigger reads app.actor_id, so every change is attributed even though
 * the API connects with a single database login.
 */
export async function asActor<T>(db: Db, actorId: string | null, work: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.actor_id', $1, true)", [actorId ?? ""]);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw translateDbError(e) ?? e;
  } finally {
    client.release();
  }
}
