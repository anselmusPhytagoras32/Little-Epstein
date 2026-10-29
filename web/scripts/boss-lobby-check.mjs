import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
const databaseUrl = process.env.BOSS_TEST_DATABASE_URL;
const appUrl = new URL(process.env.APP_URL || 'http://localhost:3000');
if (!databaseUrl || !['localhost', '127.0.0.1'].includes(new URL(databaseUrl).hostname) || !['localhost', '127.0.0.1'].includes(appUrl.hostname)) {
  throw new Error('Set BOSS_TEST_DATABASE_URL and APP_URL to an isolated local database and app.');
}
const pool = new pg.Pool({ connectionString: databaseUrl });
const ids = [randomUUID(), randomUUID(), randomUUID()];
const room = randomUUID();
const tokens = ids.map(() => randomBytes(32).toString('hex'));
async function request(i, operation, rest = {}) {
  const response = await fetch(new URL('/api/boss/lobby', appUrl), { method:'POST', headers:{ 'Content-Type':'application/json', Origin:appUrl.origin, Cookie:`getout_session=${tokens[i]}` }, body:JSON.stringify({roomId:room,operation,...rest}) });
  return { status:response.status, body:await response.json() };
}
try {
  for (let i = 0; i < ids.length; i++) {
    await pool.query('INSERT INTO players(id,email,password_hash,username,age_confirmed) VALUES($1,$2,$3,$4,true)', [ids[i], `${ids[i]}@test.invalid`, 'unused', `Tester ${i}`]);
    await pool.query("INSERT INTO sessions(token_hash,player_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [createHash('sha256').update(tokens[i]).digest('hex'), ids[i]]);
  }
  await pool.query("INSERT INTO rooms(id,name,timezone,invitation_code,host_id) VALUES($1,'Test crew','UTC',$2,$3)", [room, randomBytes(32).toString('hex'), ids[0]]);
  for (const id of ids.slice(0,2)) await pool.query('INSERT INTO room_members(room_id,player_id) VALUES($1,$2)', [room,id]);
  const crossOrigin = await fetch(new URL('/api/boss/lobby', appUrl), { method:'POST', headers:{ 'Content-Type':'application/json', Origin:'https://untrusted.example', Cookie:`getout_session=${tokens[0]}` }, body:JSON.stringify({ roomId:room, operation:'join', opponent:'kirkify' }) });
  assert.equal(crossOrigin.status,403);
  assert.equal((await request(2,'join',{opponent:'kirkify'})).status,403);
  assert.equal((await request(0,'join',{opponent:'kirkify'})).body.lobby.host,true);
  assert.equal((await request(1,'join',{opponent:'kirkify'})).body.lobby.players.length,2);
  assert.equal((await request(1,'start')).status,403);
  const raid = await request(0,'start');
  assert.equal(raid.body.lobby.maxHp,30000);
  assert.equal((await request(2,'join',{opponent:'kirkify'})).status,403);
  const before = await request(0,'heartbeat',{damageTotal:100,x:250,y:350,bossX:320,bossY:180});
  assert.ok(before.body.lobby.hp > 29000, 'endurance shield prevents an early knockout');
  assert.equal(before.body.lobby.players.find(p=>p.self).x,250);
  const guest = await request(1,'heartbeat');
  assert.equal(guest.body.lobby.bossX,320);
  assert.equal(guest.body.lobby.bossY,180);
  await request(0,'heartbeat',{damageTotal:100,alive:false});
  const newHost = await request(1,'heartbeat');
  assert.equal(newHost.body.lobby.host,true);
  await pool.query("UPDATE boss_raids SET started_at=now()-interval '301 seconds',hp=10 WHERE room_id=$1",[room]);
  const dead = await request(0,'heartbeat',{damageTotal:1000,alive:true});
  assert.equal(dead.body.lobby.hp,10);
  assert.equal(dead.body.lobby.players.find(p=>p.self).alive,false);
  const win = await request(1,'heartbeat',{damageTotal:100,x:250,y:350});
  assert.equal(win.body.lobby.phase,'won');
  assert.equal((await request(1,'heartbeat')).body.lobby.phase,'won');
  await request(1,'leave');
  assert.equal((await request(0,'leave')).body.lobby, null);
  console.log('Membership, lobby join, host authority, scaling, duration shield, positions, and shared victory passed.');
} finally {
  try {
    await pool.query('DELETE FROM rooms WHERE id=$1', [room]);
    await pool.query('DELETE FROM players WHERE id=ANY($1::uuid[])', [ids]);
  } finally { await pool.end(); }
}
