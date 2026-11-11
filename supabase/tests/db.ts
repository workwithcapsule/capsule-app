import pg from "pg";
import { P, type Persona } from "./fixtures";

/**
 * Test helpers. Each check runs inside a transaction that is always rolled
 * back, signed in as one persona exactly the way Supabase signs in a request
 * (the "authenticated" role plus the person's id in the request claims), so
 * row-level security applies just as it does in the real app.
 */

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

export type Db = pg.PoolClient;

/** What happened when a persona tried something. */
export type Outcome = { allowed: boolean; detail: string };

export async function as<T>(who: Persona | "signed out", fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("begin");
    if (who === "signed out") {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "anon" }),
      ]);
      await db.query("set local role anon");
    } else {
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: P[who], role: "authenticated", aud: "authenticated" }),
      ]);
      await db.query("set local role authenticated");
    }
    return await fn(db);
  } finally {
    await db.query("rollback");
    db.release();
  }
}

/**
 * Runs one statement. It counts as allowed when it succeeds and touches at
 * least one row: row-level security hides rows rather than raising errors,
 * so a blocked read returns nothing and a blocked update changes nothing.
 */
export async function attempt(db: Db, sql: string, params: unknown[] = []): Promise<Outcome> {
  await db.query("savepoint attempt");
  try {
    const res = await db.query(sql, params);
    await db.query("release savepoint attempt");
    const n = res.rowCount ?? 0;
    return { allowed: n > 0, detail: `${n} row${n === 1 ? "" : "s"}` };
  } catch (e) {
    await db.query("rollback to savepoint attempt");
    const err = e as { code?: string; message: string };
    return { allowed: false, detail: `${err.code ?? "error"}: ${err.message}` };
  }
}

/** Reads one value as the current persona. */
export async function value<T>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const res = await db.query(sql, params);
  return res.rows[0] ? (Object.values(res.rows[0])[0] as T) : undefined;
}
