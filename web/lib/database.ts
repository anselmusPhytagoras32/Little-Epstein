import { Pool } from "pg";

const globalPool = globalThis as typeof globalThis & { escapeGamePool?: Pool };

export function database(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("Online play is being prepared. Practice mode is ready on this device.");
  if (!globalPool.escapeGamePool) {
    globalPool.escapeGamePool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 12_000,
      application_name: "get-out-november",
    });
  }
  return globalPool.escapeGamePool;
}
