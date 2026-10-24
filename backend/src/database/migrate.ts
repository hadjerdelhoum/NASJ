import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

async function main() {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
  );
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const done = await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [f]);
    if (done.rowCount) continue;
    await pool.query("BEGIN");
    try {
      await pool.query(readFileSync(join(dir, f), "utf8"));
      await pool.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]);
      await pool.query("COMMIT");
      console.log("applied", f);
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
