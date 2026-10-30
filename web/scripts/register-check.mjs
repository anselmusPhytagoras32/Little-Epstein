import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
import pg from "pg";

const url = process.env.BOSS_TEST_DATABASE_URL;
const app = new URL(process.env.APP_URL || "http://127.0.0.1:3104");
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !["localhost", "127.0.0.1"].includes(app.hostname)) throw new Error("Use a disposable local database and application.");
const pool = new pg.Pool({ connectionString: url });
const email = `${randomUUID()}@test.invalid`;
try {
  const response = await new Promise((resolve, reject) => {
    const request = http.request(new URL("/api/auth", app), { method: "POST", headers: { host: "escape.example", origin: "https://escape.example", "x-forwarded-proto": "https", "content-type": "application/json" } }, result => {
      let data = ""; result.setEncoding("utf8"); result.on("data", chunk => { data += chunk; }); result.on("end", () => resolve({ status: result.statusCode, headers: result.headers, body: JSON.parse(data) }));
    });
    request.on("error", reject);
    request.end(JSON.stringify({ action: "register", username: "QA tester", email, password: "test-password-123", over18: true, timezone: "UTC" }));
  });
  assert.equal(response.status, 200, `Registration through HTTPS proxy: ${response.body.error || response.status}`);
  assert.match((response.headers["set-cookie"] || []).join(";"), /HttpOnly.*SameSite=Lax.*Secure/i, "Registration sets a secure session cookie");
  const player = await pool.query("SELECT id FROM players WHERE email=$1", [email]);
  assert.equal(player.rowCount, 1, "Registration creates an account");
  assert.equal((await pool.query("SELECT 1 FROM rooms WHERE host_id=$1", [player.rows[0].id])).rowCount, 1, "Registration creates a room");
  console.log("Registration through an HTTPS proxy creates an account, room, and secure session.");
} finally {
  const player = await pool.query("SELECT id FROM players WHERE email=$1", [email]);
  if (player.rowCount) {
    await pool.query("DELETE FROM rooms WHERE host_id=$1", [player.rows[0].id]);
    await pool.query("DELETE FROM players WHERE id=$1", [player.rows[0].id]);
  }
  await pool.end();
}
