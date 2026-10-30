import assert from "node:assert/strict";

const app = new URL(process.env.APP_URL || "http://127.0.0.1:3103");
if (!["localhost", "127.0.0.1"].includes(app.hostname)) throw new Error("Use an isolated local application with an unreachable database.");
const response = await fetch(new URL("/api/session", app), { headers: { Cookie: `getout_session=${"a".repeat(64)}` } });
assert.equal(response.status, 503, "A database outage must not masquerade as a signed-out session");
console.log("A database outage returns 503 instead of clearing the session.");
