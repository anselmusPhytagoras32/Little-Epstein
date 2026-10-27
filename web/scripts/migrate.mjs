import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Add your Neon connection string, then run pnpm db:migrate again.");
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 15_000, application_name: "get-out-migrations" });
  try {
    const migrationPath = fileURLToPath(new URL("../db/migrations/", import.meta.url));
    const migrations = (await readdir(migrationPath)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
    const statements = await Promise.all(migrations.map(name => readFile(path.join(migrationPath, name), "utf8")));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const sql of statements) await client.query(sql);
      await client.query("COMMIT");
      console.log("Neon is ready. The November game tables are in place.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`Database setup failed: ${reason}`);
    process.exitCode = 1;
  } finally { await pool.end(); }
}
