import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to wake the database.");
  process.exitCode = 1;
} else {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    application_name: "escape-database-wake",
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log("Database responded.");
  } catch {
    console.error("Database wake-up failed. Check the connection and GitHub Actions secret.");
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
