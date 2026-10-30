import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { reconcileRooms } from "./reconcile-rooms.mjs";

const url = process.env.BOSS_TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Use a disposable local BOSS_TEST_DATABASE_URL.");
const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const player = randomUUID(), room = randomUUID();
  await client.query("INSERT INTO players(id,email,password_hash,username,age_confirmed) VALUES($1,$2,'unused','Sweep tester',true)", [player, `${player}@test.invalid`]);
  await client.query("INSERT INTO rooms(id,name,timezone,invitation_code,host_id,phase) VALUES($1,'Sweep test','UTC',$2,$3,'active')", [room, randomUUID(), player]);
  await client.query("INSERT INTO room_members(room_id,player_id) VALUES($1,$2)", [room, player]);
  await client.query("INSERT INTO daily_checkins(room_id,player_id,game_date) VALUES($1,$2,'2026-11-03')", [room, player]);
  await reconcileRooms(client, new Date("2026-11-01T12:00:00Z"));
  assert.equal((await client.query("SELECT status FROM room_members WHERE room_id=$1 AND player_id=$2", [room, player])).rows[0].status, "alive", "Today is not due until local midnight");
  await reconcileRooms(client, new Date("2026-11-04T12:00:00Z"));
  let member = (await client.query("SELECT status,eliminated_on::text FROM room_members WHERE room_id=$1 AND player_id=$2", [room, player])).rows[0];
  assert.deepEqual(member, { status: "eliminated", eliminated_on: "2026-11-01" }, "A delayed sweep identifies the first missed day");
  await client.query("DELETE FROM room_events WHERE room_id=$1", [room]);
  await client.query("UPDATE room_members SET status='alive',eliminated_on=NULL,eliminated_reason=NULL WHERE room_id=$1", [room]);
  await client.query("DELETE FROM daily_checkins WHERE room_id=$1", [room]);
  await client.query("INSERT INTO daily_checkins(room_id,player_id,game_date) SELECT $1,$2,day::date FROM generate_series(date '2026-11-01',date '2026-11-30',interval '1 day') day", [room, player]);
  await client.query("DELETE FROM daily_checkins WHERE room_id=$1 AND game_date='2026-11-15'", [room]);
  await reconcileRooms(client, new Date("2026-12-01T12:00:00Z"));
  member = (await client.query("SELECT status,eliminated_on::text FROM room_members WHERE room_id=$1 AND player_id=$2", [room, player])).rows[0];
  assert.deepEqual(member, { status: "eliminated", eliminated_on: "2026-11-15" }, "A missed earlier day cannot become a win after the season");
  await client.query("UPDATE rooms SET phase='active' WHERE id=$1", [room]);
  await client.query("UPDATE room_members SET status='alive',eliminated_on=NULL,eliminated_reason=NULL WHERE room_id=$1", [room]);
  await client.query("INSERT INTO daily_checkins(room_id,player_id,game_date) VALUES($1,$2,'2026-11-15')", [room, player]);
  await reconcileRooms(client, new Date("2026-12-01T12:00:00Z"));
  member = (await client.query("SELECT status,eliminated_on::text FROM room_members WHERE room_id=$1 AND player_id=$2", [room, player])).rows[0];
  assert.equal(member.status, "won", "A complete run wins after the season");
  console.log("Delayed sweep and complete-run winner checks passed.");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}
