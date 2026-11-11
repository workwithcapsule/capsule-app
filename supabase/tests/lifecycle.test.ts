import { afterAll, describe, expect, it } from "vitest";
import { pool } from "./db";
import { CAPSULE, EVENT, P } from "./fixtures";

/**
 * Things that happen outside any one person's session, run with full
 * database rights inside a transaction that is rolled back.
 */
async function asSystem<T>(
  fn: (
    q: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
  ) => Promise<T>,
) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    return await fn((sql, params) => db.query(sql, params));
  } finally {
    await db.query("rollback");
    db.release();
  }
}

describe("Account and data lifecycle", () => {
  it("deleting a person's account keeps their comments in the activity log, without their name", async () => {
    await asSystem(async (q) => {
      await q(`delete from auth.users where id = $1`, [P.christina]);
      const { rows } = await q(
        `select actor_user_id, data->>'body' as body from public.events where id = $1`,
        [EVENT.en1Comment],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_user_id).toBeNull();
      expect(rows[0].body).toContain("confirm the API date");
    });
  });

  it("removing someone from the org clears them as capsule owner rather than deleting the capsule", async () => {
    await asSystem(async (q) => {
      await q(`delete from public.org_members where user_id = $1`, [P.christina]);
      const { rows } = await q(`select owner_id from public.capsules where id = $1`, [CAPSULE.en1]);
      expect(rows).toHaveLength(1);
      expect(rows[0].owner_id).toBeNull();
    });
  });

  it("the activity log can't be edited, even with full database rights", async () => {
    await asSystem(async (q) => {
      await expect(
        q(`update public.events set data = '{}' where id = $1`, [EVENT.en1Comment]),
      ).rejects.toThrow(/append-only/);
    });
  });

  it("a new sign-in automatically gets a profile", async () => {
    await asSystem(async (q) => {
      await q(
        `insert into auth.users (id, email, raw_user_meta_data, aud, role)
         values ('00000000-0000-4000-8000-00000000ffff', 'new@acme.test', '{"name":"New Person"}', 'authenticated', 'authenticated')`,
      );
      const { rows } = await q(
        `select email, name from public.users where id = '00000000-0000-4000-8000-00000000ffff'`,
      );
      expect(rows[0]).toEqual({ email: "new@acme.test", name: "New Person" });
    });
  });
});

afterAll(() => pool.end());
