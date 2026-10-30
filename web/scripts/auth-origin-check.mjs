import assert from "node:assert/strict";
import http from "node:http";

const app = new URL(process.env.APP_URL || "http://127.0.0.1:3100");
if (!["localhost", "127.0.0.1"].includes(app.hostname)) throw new Error("Use an isolated local application.");
const request = (origin, extra = {}) => new Promise((resolve, reject) => {
  const req = http.request(new URL("/api/auth", app), { method: "POST", headers: { host: "escape.example", origin, "x-forwarded-proto": "https", "content-type": "application/json", ...extra } }, response => {
    let data = ""; response.setEncoding("utf8"); response.on("data", chunk => { data += chunk; }); response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
  });
  req.on("error", reject);
  req.end(JSON.stringify({ action: "register", username: "Tester", email: "tester@example.invalid", password: "password123", timezone: "UTC" }));
});
const same = await request("https://escape.example");
assert.equal(same.status, 403);
assert.match(same.body.error, /18 and older/, "Same-origin HTTPS reaches age validation behind a proxy");
const cross = await request("https://attacker.example");
assert.equal(cross.status, 403);
assert.match(cross.body.error, /Refresh the page/, "Cross-origin requests remain blocked");
const forged = await request("https://attacker.example", { "x-forwarded-host": "attacker.example" });
assert.equal(forged.status, 403);
assert.match(forged.body.error, /Refresh the page/, "A forged forwarded host cannot bypass the origin check");
const fetchSite = await request("https://escape.example", { "sec-fetch-site": "cross-site" });
assert.equal(fetchSite.status, 403);
assert.match(fetchSite.body.error, /Refresh the page/, "Cross-site fetch metadata remains blocked");
console.log("Proxied same-origin registration and cross-site protection passed.");
