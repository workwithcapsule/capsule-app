import { execFileSync } from "node:child_process";
import pg from "pg";
import { DATABASE_URL } from "./db";
import { SEED_SQL } from "./fixtures";

/** Before the tests: rebuild the local database from the migrations, then load the personas. */
export default async function setup() {
  execFileSync("./scripts/db-reset.sh", {
    stdio: "inherit",
    env: { ...process.env, TEST_DATABASE_URL: DATABASE_URL },
  });
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(SEED_SQL);
  } finally {
    await client.end();
  }
}
