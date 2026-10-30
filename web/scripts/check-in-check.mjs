import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const database = process.env.BOSS_TEST_DATABASE_URL;
const origin = new URL(process.env.APP_URL || "http://127.0.0.1:3102");
if (!database || !["localhost", "127.0.0.1"].includes(new URL(database).hostname) || !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Use an isolated local database and application.");
const pool = new pg.Pool({ connectionString: database });
const player = randomUUID(), room = randomUUID(), token = randomBytes(32).toString("hex");
try {
  await pool.query("INSERT INTO players(id,email,password_hash,username,age_confirmed) VALUES($1,$2,'unused','QA player',true)", [player, `${player}@test.invalid`]);
  await pool.query("INSERT INTO sessions(token_hash,player_id,expires_at) VALUES($1,$2,now()+interval '1 year')", [createHash("sha256").update(token).digest("hex"), player]);
  await pool.query("INSERT INTO rooms(id,name,timezone,invitation_code,host_id,phase) VALUES($1,'QA room','UTC',$2,$3,'active')", [room, randomUUID(), player]);
  await pool.query("INSERT INTO room_members(room_id,player_id) VALUES($1,$2)", [room, player]);
  const response = await fetch(new URL("/api/check-in", origin), { method: "POST", headers: { "Content-Type": "application/json", Origin: origin.origin, Cookie: `getout_session=${token}` }, body: JSON.stringify({ roomId: room }) });
  assert.equal(response.status, 409, "Check-in after missed days is rejected");
  const result = await pool.query("SELECT status,eliminated_on::text FROM room_members WHERE room_id=$1 AND player_id=$2", [room, player]);
  assert.deepEqual(result.rows[0], { status: "eliminated", eliminated_on: "2026-11-01" }, "The first missed day is recorded");
  assert.equal(Number((await pool.query("SELECT count(*) FROM daily_checkins WHERE room_id=$1", [room])).rows[0].count), 0, "A rejected check-in is not recorded");
  await pool.query("UPDATE room_members SET status='alive',eliminated_on=NULL,eliminated_reason=NULL WHERE room_id=$1 AND player_id=$2", [room, player]);
  await pool.query("INSERT INTO daily_checkins(room_id,player_id,game_date) SELECT $1,$2,day::date FROM generate_series(date '2026-11-01',date '2026-11-03',interval '1 day') day", [room, player]);
  const checkIn = () => fetch(new URL("/api/check-in", origin), { method: "POST", headers: { "Content-Type": "application/json", Origin: origin.origin, Cookie: `getout_session=${token}` }, body: JSON.stringify({ roomId: room }) });
  assert.equal((await checkIn()).status, 200, "A player with no missed days can check in");
  assert.equal((await checkIn()).status, 409, "A second check-in on the same day is rejected");
  console.log("Missed-day elimination, valid check-in, and duplicate prevention passed.");
} finally {
  await pool.query("DELETE FROM rooms WHERE id=$1", [room]);
  await pool.query("DELETE FROM players WHERE id=$1", [player]);
  await pool.end();
}
