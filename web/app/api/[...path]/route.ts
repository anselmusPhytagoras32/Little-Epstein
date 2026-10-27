import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { type NextRequest, NextResponse } from "next/server";
import type { PushSubscription as BrowserSubscription } from "web-push";
import { consecutiveStreak, GAME_END, GAME_START, localDateKey, inviteToken, ROOM_LIMIT } from "../../../lib/game-rules";
import { database } from "../../../lib/database";
import { isAvatarAccent, isAvatarId } from "../../../lib/avatars";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "getout_session";
const SESSION_DAYS = 30;
const MAX_BODY = 12_000;
const validReactions = new Set(["rooting", "sparkle", "lifebuoy"]);
const validUserName = (name: string) => /^.{2,24}$/u.test(name.trim());
const validZone = (zone: string) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } };
const emailForm = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const idForm = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthedPlayer = { id: string; email: string; username: string; avatar_id: string; avatar_accent: string; timezone: string; reminder_time: string | null; reminders_enabled: boolean };
type DbClient = PoolClient;

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function invite() { return randomBytes(32).toString("base64url"); }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" } }); }
function secureCookie() { return process.env.NODE_ENV === "production" ? "; Secure" : ""; }
function cookieValue(value: string, maxAge: number) { return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie()}`; }
function dbUnavailable(e: unknown) { const msg = e instanceof Error ? e.message : ""; return msg.includes("being prepared") || msg.includes("DATABASE_URL") || process.env.DATABASE_URL === undefined; }
function fail(message: string, status = 400) { return json({ error: message }, status); }
function validUsername(value: unknown): value is string { return typeof value === "string" && validUserName(value); }
function validTime(value: unknown): value is string { return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }

async function body(request: NextRequest) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new RequestError("This request is too large.", 413);
  try { const value = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
  catch { throw new Error("Send a valid form and try again."); }
}

function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) throw new RequestError("Refresh the page and try again.", 403);
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new RequestError("Refresh the page and try again.", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new RequestError("Send this form again from the game.", 415);
}

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }

async function authed(request: NextRequest): Promise<AuthedPlayer> {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token || token.length !== 64) throw new RequestError("Sign in to keep playing with your friends.", 401);
  const result = await database().query<AuthedPlayer>(`SELECT p.id,p.email,p.username,p.avatar_id,p.avatar_accent,p.timezone,p.reminder_time::text AS reminder_time,p.reminders_enabled FROM sessions s JOIN players p ON p.id=s.player_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [hash(token)]);
  if (!result.rowCount) throw new RequestError("Your sign-in expired. Log in to keep playing.", 401);
  return result.rows[0];
}

async function insertRoom(client: DbClient, playerId: string, name: string, timezone: string) {
  const code = invite();
  const created = await client.query<{ id: string; name: string; timezone: string; phase: string }>(
    `INSERT INTO rooms(name,timezone,invitation_code,host_id,phase) VALUES ($1,$2,$3,$4,'open') RETURNING id,name,timezone,phase`,
    [name,timezone,code,playerId],
  );
  await client.query(`INSERT INTO room_members(room_id,player_id) VALUES ($1,$2)`, [created.rows[0].id,playerId]);
  return { ...created.rows[0], invitation: code, players: [{ id: playerId, username: "You", status: "alive", checkedIn: false, streak: 0, progress: 0, self: true }] };
}

async function loadRoom(playerId: string, selectedRoomId: string | null = null) {
  const pool = database();
  await pool.query(`UPDATE rooms SET phase='active' WHERE phase='open' AND (now() AT TIME ZONE timezone)::date >= $1::date AND (now() AT TIME ZONE timezone)::date <= $2::date`,[GAME_START,GAME_END]);
  await pool.query(`UPDATE room_members m SET status='won' FROM rooms r WHERE r.id=m.room_id AND m.status='alive' AND r.phase='active' AND (now() AT TIME ZONE r.timezone)::date > $1::date AND (SELECT count(*) FROM daily_checkins c WHERE c.room_id=m.room_id AND c.player_id=m.player_id AND c.game_date BETWEEN $2::date AND $1::date)=30`,[GAME_END,GAME_START]);
  const rooms = await pool.query<{ id:string;name:string;timezone:string;phase:string;invitation:string;player_id:string;username:string;avatar_id:string;avatar_accent:string;status:"alive"|"eliminated"|"won";checked_in:boolean;self:boolean;eliminated_on:string|null }>(
    `WITH selected_room AS (
       SELECT r.id FROM rooms r
       JOIN room_members mine ON mine.room_id=r.id AND mine.player_id=$1
       WHERE r.phase IN ('open','active','complete') AND ($2::uuid IS NULL OR r.id=$2::uuid)
       ORDER BY (r.phase='complete'),r.created_at DESC LIMIT 1
     )
     SELECT r.id,r.name,r.timezone,r.phase,r.invitation_code AS invitation,m.player_id,p.username,p.avatar_id,p.avatar_accent,m.status,m.eliminated_on::text AS eliminated_on,
       EXISTS(SELECT 1 FROM daily_checkins c WHERE c.room_id=r.id AND c.player_id=m.player_id AND c.game_date=(now() AT TIME ZONE r.timezone)::date) AS checked_in,
       (m.player_id=$1) AS self
     FROM selected_room selected JOIN rooms r ON r.id=selected.id
     JOIN room_members m ON m.room_id=r.id JOIN players p ON p.id=m.player_id
     ORDER BY m.joined_at ASC,m.player_id ASC`,[playerId,selectedRoomId]);
  const roomIds = [...new Set(rooms.rows.map((row)=>row.id))];
  const checkins = roomIds.length ? await pool.query<{ room_id:string;player_id:string;game_date:string }>(`SELECT c.room_id,c.player_id,c.game_date::text AS game_date FROM daily_checkins c JOIN room_members own ON own.room_id=c.room_id AND own.player_id=$1 WHERE c.room_id=ANY($2::uuid[]) AND c.game_date >= $3::date - 30 AND c.game_date <= (now() AT TIME ZONE (SELECT timezone FROM rooms WHERE id=c.room_id))::date`,[playerId,roomIds,GAME_START]) : { rows: [] as {room_id:string;player_id:string;game_date:string}[] };
  const room = rooms.rows[0];
  if (!room) return null;
  const today = localDateKey(new Date(),room.timezone);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0,10);
  const selfDays = checkins.rows.filter((entry)=>entry.room_id===room.id&&entry.player_id===playerId).map((entry)=>entry.game_date).sort();
  return { id: room.id,name: room.name,timezone: room.timezone,phase: room.phase,invitation: room.invitation,checkedInDays:selfDays,
    players: rooms.rows.map((item)=>{
      const dates=checkins.rows.filter((entry)=>entry.room_id===item.id&&entry.player_id===item.player_id).map((entry)=>entry.game_date);
      return { id:item.player_id,username:item.username,avatarId:item.avatar_id,avatarAccent:item.avatar_accent,status:item.status,checkedIn:item.checked_in,self:item.self,eliminated_on:item.self?item.eliminated_on:null,progress:dates.filter((date)=>date>=GAME_START&&date<=GAME_END).length,streak:consecutiveStreak(dates,today>GAME_END?GAME_END:item.checked_in?today:yesterday) };
    }) };
}

async function register(data: Record<string, unknown>) {
  const email=typeof data.email==="string"?data.email.trim().toLowerCase():""; const pass=typeof data.password==="string"?data.password:""; const username=typeof data.username==="string"?data.username.trim():""; const timezone=typeof data.timezone==="string"?data.timezone:"UTC";
  if (!emailForm.test(email)||email.length>254) return fail("Enter a valid email address.");
  if (pass.length<8||pass.length>128) return fail("Choose a password between 8 and 128 characters.");
  if (!validUsername(username)) return fail("Choose a display name between 2 and 24 characters.");
  if (data.over18 !== true) return fail("This challenge is for adults 18 and older. Confirm your age to join.", 403);
  if (!validZone(timezone)) return fail("Choose a supported timezone.");
  const invitation=typeof data.invite==="string"?inviteToken(data.invite):null;
  if(typeof data.invite==="string"&&data.invite.trim()&&!invitation)return fail("Paste a valid room invitation.");
  const hashedPassword=await (await import("bcryptjs")).default.hash(pass,12); const pool=database(); const client=await pool.connect(); const token=randomBytes(32).toString("hex"); let playerId="";
  try {
    await client.query("BEGIN");
    const user=await client.query<{id:string}>(`INSERT INTO players(email,password_hash,username,timezone,age_confirmed) VALUES ($1,$2,$3,$4,true) RETURNING id`,[email,hashedPassword,username,timezone]); playerId=user.rows[0].id;
    if (invitation) { const locked=await client.query<{id:string;phase:string;timezone:string}>(`SELECT id,phase,timezone FROM rooms WHERE invitation_code=$1 FOR UPDATE`,[invitation]); if (!locked.rowCount||locked.rows[0].phase!=="open"||localDateKey(new Date(),locked.rows[0].timezone)>=GAME_START) throw new RequestError("That invitation has expired or the challenge has already started.",404); const count=await client.query<{n:string}>(`SELECT count(*) AS n FROM room_members WHERE room_id=$1`,[locked.rows[0].id]); if(Number(count.rows[0].n)>=ROOM_LIMIT)throw new RequestError("That room is full. Ask your friend to create another one.",409); await client.query(`INSERT INTO room_members(room_id,player_id) VALUES ($1,$2)`,[locked.rows[0].id,playerId]); }
    else { const date=localDateKey(new Date(),timezone); if(date>=GAME_START&&date<=GAME_END)throw new RequestError("The November challenge has started. New players can join the next round.",409); if(date>GAME_END)throw new RequestError("The November escape is complete. See you next year!",410); await insertRoom(client,playerId,`${username}'s escape`.slice(0,36),timezone); }
    await client.query(`INSERT INTO sessions(token_hash,player_id,expires_at) VALUES ($1,$2,now()+interval '${SESSION_DAYS} days')`,[hash(token),playerId]); await client.query("COMMIT");
  } catch(e) { await client.query("ROLLBACK"); if(e instanceof RequestError)throw e; if((e as {code?:string}).code==="23505")throw new RequestError("That email already has an account. Please sign in.",409); throw e; } finally { client.release(); }
  const response=json({ok:true});response.headers.append("Set-Cookie",cookieValue(token,SESSION_DAYS*86400));return response;
}

async function signIn(request: NextRequest, data: Record<string, unknown>) {
  const email=typeof data.email==="string"?data.email.trim().toLowerCase():"";const pass=typeof data.password==="string"?data.password:"";
  if(!emailForm.test(email)||email.length>254||pass.length>128)return fail("Check your email and password.",401);
  const identity=`${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local"}:${email}`;const key=hash(identity);const pool=database();
  await pool.query(`INSERT INTO login_attempts(id_hash,attempts,window_started_at) VALUES($1,0,now()) ON CONFLICT(id_hash) DO UPDATE SET attempts=0,window_started_at=now() WHERE login_attempts.window_started_at < now()-interval '15 minutes'`,[key]);
  const attempts=await pool.query<{attempts:number;locked_until:string|null}>(`SELECT attempts,locked_until FROM login_attempts WHERE id_hash=$1`,[key]);
  if((attempts.rows[0]?.attempts??0)>=8&&attempts.rows[0]?.locked_until&&new Date(attempts.rows[0].locked_until)>new Date())throw new RequestError("Too many tries. Please wait fifteen minutes, then try again.",429);
  const result=await pool.query<{id:string;password_hash:string}>(`SELECT id,password_hash FROM players WHERE email=$1`,[email]);const row=result.rows[0];const matches=row?await (await import("bcryptjs")).default.compare(pass,row.password_hash):false;
  if(!matches){await pool.query(`INSERT INTO login_attempts(id_hash,attempts,window_started_at,locked_until) VALUES($1,1,now(),NULL) ON CONFLICT(id_hash) DO UPDATE SET attempts=CASE WHEN login_attempts.window_started_at<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,window_started_at=CASE WHEN login_attempts.window_started_at<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_started_at END,locked_until=CASE WHEN login_attempts.attempts>=7 THEN now()+interval '15 minutes' ELSE login_attempts.locked_until END`,[key]);throw new RequestError("That email and password don’t match. Give it another try.",401);}
  await pool.query(`DELETE FROM login_attempts WHERE id_hash=$1`,[key]);const token=randomBytes(32).toString("hex");await pool.query(`INSERT INTO sessions(token_hash,player_id,expires_at) VALUES($1,$2,now()+interval '${SESSION_DAYS} days')`,[hash(token),row!.id]);const response=json({ok:true});response.headers.append("Set-Cookie",cookieValue(token,SESSION_DAYS*86400));return response;
}

export async function GET(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  try {
    const {path}=await params;const action=path.join("/");
    if(action==="session"){
      const user=await authed(request);
      const selectedRoomId=request.nextUrl.searchParams.get("room");
      if(selectedRoomId&&!idForm.test(selectedRoomId))return fail("Choose a valid room.");
      const room=await loadRoom(user.id,selectedRoomId);
      if(selectedRoomId&&!room)return fail("You need an invitation to open this room.",403);
      return json({user:{username:user.username,avatarId:user.avatar_id,avatarAccent:user.avatar_accent,timezone:user.timezone,reminder:user.reminder_time?.slice(0,5)??"",remindersEnabled:user.reminders_enabled},room});
    }
    if(action==="push/key")return json({publicKey:process.env.VAPID_PUBLIC_KEY||""});
    if(action==="room/feed"){
      const user=await authed(request);const roomId=request.nextUrl.searchParams.get("room");
      if(!roomId||!idForm.test(roomId))return fail("Choose a room first.");
      const result=await database().query<{username:string;event_type:string;game_date:string;milestone:number|null;reaction:string|null;created_at:string}>(
        `SELECT p.username,e.event_type,e.game_date::text,e.milestone,e.reaction,e.created_at::text FROM room_events e JOIN room_members own ON own.room_id=e.room_id AND own.player_id=$2 JOIN players p ON p.id=e.player_id WHERE e.room_id=$1 ORDER BY e.id DESC LIMIT 8`,[roomId,user.id]);
      return json({events:result.rows});
    }
    return fail("That trail leads nowhere.",404);
  }
  catch(e){if(e instanceof RequestError)return fail(e.message,e.status);if(dbUnavailable(e))return fail("Practice mode is ready on this device. Connect DATABASE_URL to play with your friends.",503);return fail("Your game could not load just now. Refresh and try again.",503);}
}

export async function POST(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  try { assertSameOrigin(request);const {path}=await params;const action=path.join("/");
    if(action==="auth"){const data=await body(request);if(data.action==="logout"){const token=request.cookies.get(COOKIE)?.value;if(token)await database().query(`DELETE FROM sessions WHERE token_hash=$1`,[hash(token)]);const out=json({ok:true});out.headers.append("Set-Cookie",cookieValue("",0));return out;}if(data.action==="register")return await register(data);if(data.action==="login")return await signIn(request,data);return fail("Choose sign in or create an account.");}
    const user=await authed(request);
    if(action==="rooms"){
      const data=await body(request);
      const roomName=typeof data.name==="string"?data.name.trim():"";
      const timezone=typeof data.timezone==="string"?data.timezone:"UTC";
      if(roomName.length<2||roomName.length>36)return fail("Choose a room name between 2 and 36 characters.");
      if(!validZone(timezone))return fail("Choose a supported timezone.");
      const date=localDateKey(new Date(),timezone);
      if(date>=GAME_START&&date<=GAME_END)return fail("The November challenge has started. New players can join the next round.",409);
      if(date>GAME_END)return fail("The November escape is complete. Rooms for the next round are not open yet.",410);
      const client=await database().connect();
      let createdRoomId="";
      try{
        await client.query("BEGIN");
        const room=await insertRoom(client,user.id,roomName,timezone);
        createdRoomId=room.id;
        await client.query("COMMIT");
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
      return json({room:await loadRoom(user.id,createdRoomId)});
    }
    if(action==="rooms/join"){
      const data=await body(request);
      const code=typeof data.invite==="string"?inviteToken(data.invite):null;
      if(!code)return fail("Paste a valid room invitation.");
      const client=await database().connect();
      let joinedRoomId="";
      try{
        await client.query("BEGIN");
        const found=await client.query<{id:string;timezone:string;phase:string}>(`SELECT id,timezone,phase FROM rooms WHERE invitation_code=$1 FOR UPDATE`,[code]);
        if(!found.rowCount)throw new RequestError("That invitation link has expired. Ask your friend to send another.",404);
        const room=found.rows[0];
        joinedRoomId=room.id;
        const membership=await client.query(`SELECT 1 FROM room_members WHERE room_id=$1 AND player_id=$2`,[room.id,user.id]);
        if(!membership.rowCount){
          const date=localDateKey(new Date(),room.timezone);
          if(room.phase!=="open"||date>=GAME_START)throw new RequestError("New players can join before November 1. This room has already started.",409);
          const count=await client.query<{count:string}>(`SELECT count(*) FROM room_members WHERE room_id=$1`,[room.id]);
          if(Number(count.rows[0].count)>=ROOM_LIMIT)throw new RequestError("That room is full. Ask your friend to create another one.",409);
          await client.query(`INSERT INTO room_members(room_id,player_id) VALUES($1,$2)`,[room.id,user.id]);
        }
        await client.query("COMMIT");
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
      return json({room:await loadRoom(user.id,joinedRoomId)});
    }
    if(action==="check-in"){const data=await body(request);const roomId=typeof data.roomId==="string"?data.roomId:"";if(!idForm.test(roomId))return fail("Select a room before logging your day.");const client=await database().connect();try{await client.query("BEGIN");const found=await client.query<{timezone:string;status:string;phase:string}>(`SELECT r.timezone,m.status,r.phase FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE r.id=$1 AND m.player_id=$2 FOR UPDATE OF m`,[roomId,user.id]);if(!found.rowCount)throw new RequestError("You need an invitation to check in to this room.",403);const {timezone,status}=found.rows[0];if(status!=="alive")throw new RequestError("You’re spectating this round. Join the next one to play again.",409);const date=localDateKey(new Date(),timezone);if(date<GAME_START||date>GAME_END)throw new RequestError("Your daily check-in opens November 1.",409);await client.query(`UPDATE rooms SET phase='active' WHERE id=$1 AND phase='open'`,[roomId]);const saved=await client.query(`INSERT INTO daily_checkins(room_id,player_id,game_date) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING game_date`,[roomId,user.id,date]);if(!saved.rowCount)throw new RequestError("Today is already logged. See you tomorrow!",409);await client.query(`INSERT INTO room_events(room_id,player_id,event_type,game_date) VALUES($1,$2,'checked_in',$3)`,[roomId,user.id,date]);const prior=await client.query<{game_date:string}>(`SELECT game_date::text FROM daily_checkins WHERE room_id=$1 AND player_id=$2 AND game_date<=$3 ORDER BY game_date DESC LIMIT 30`,[roomId,user.id,date]);const streak=consecutiveStreak(prior.rows.map(x=>x.game_date),date);if([3,7,14,21,30].includes(streak))await client.query(`INSERT INTO room_events(room_id,player_id,event_type,game_date,milestone) VALUES($1,$2,'milestone',$3,$4)`,[roomId,user.id,date,streak]);await client.query("COMMIT");return json({ok:true,streak,date});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}
    if(action==="report"){const data=await body(request);if(data.confirm!==true)return fail("Confirm your honest report before submitting it.");const active=await database().query<{room_id:string;timezone:string}>(`SELECT r.id AS room_id,r.timezone FROM rooms r JOIN room_members m ON m.room_id=r.id WHERE m.player_id=$1 AND r.phase='active' AND m.status='alive'`,[user.id]);if(!active.rowCount)throw new RequestError("You don’t have an active challenge to report.",409);const client=await database().connect();try{await client.query("BEGIN");for(const room of active.rows){const date=localDateKey(new Date(),room.timezone);const removed=await client.query(`UPDATE room_members SET status='eliminated',eliminated_on=$3,eliminated_reason='self_reported' WHERE room_id=$1 AND player_id=$2 AND status='alive' RETURNING player_id`,[room.room_id,user.id,date]);if(removed.rowCount)await client.query(`INSERT INTO room_events(room_id,player_id,event_type,game_date) VALUES($1,$2,'eliminated',$3)`,[room.room_id,user.id,date]);}await client.query("COMMIT");return json({ok:true});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}
    if(action==="profile/avatar"){const data=await body(request);if(!isAvatarId(data.avatarId))return fail("Choose an available avatar.");if(data.avatarAccent!==undefined&&!isAvatarAccent(data.avatarAccent))return fail("Choose an available avatar color.");await database().query(`UPDATE players SET avatar_id=$2,avatar_accent=COALESCE($3,avatar_accent) WHERE id=$1`,[user.id,data.avatarId,data.avatarAccent??null]);return json({ok:true});}
    if(action==="profile"){const data=await body(request);const username=typeof data.username==="string"?data.username.trim():"";const time=typeof data.reminder==="string"?data.reminder:"";const timezone=typeof data.timezone==="string"?data.timezone:"UTC";if(!validUsername(username))return fail("Choose a display name between 2 and 24 characters.");if(time&&!validTime(time))return fail("Choose a reminder time that works for you.");if(!validZone(timezone))return fail("Choose a supported timezone.");await database().query(`UPDATE players SET username=$2,timezone=$3,reminder_time=$4::time,reminders_enabled=$5 WHERE id=$1`,[user.id,username,timezone,time||null,Boolean(time)]);return json({ok:true});}
    if(action==="reaction"){const data=await body(request);const roomId=typeof data.roomId==="string"?data.roomId:"";const target=typeof data.playerName==="string"?data.playerName:"";const reaction=typeof data.reaction==="string"?data.reaction:"";if(!idForm.test(roomId)||!validReactions.has(reaction))return fail("Choose a room and a friendly reaction.");const result=await database().query(`INSERT INTO room_events(room_id,player_id,event_type,game_date,reaction) SELECT $1,$2,'reaction',(now() AT TIME ZONE r.timezone)::date,$4 FROM rooms r JOIN room_members own ON own.room_id=r.id AND own.player_id=$2 JOIN room_members recipient ON recipient.room_id=r.id JOIN players p ON p.id=recipient.player_id WHERE r.id=$1 AND p.username=$3`,[roomId,user.id,target,reaction]);if(!result.rowCount)throw new RequestError("Only members of your room can cheer each other on.",403);return json({ok:true});}
    if(action==="push/subscribe"){const data=await body(request);if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY)throw new RequestError("Daily push reminders are being set up. Your daily reminder time is still saved.",503);const sub=data.subscription as BrowserSubscription|undefined;if(!sub?.endpoint?.startsWith("https://")||typeof sub.keys?.auth!=="string"||typeof sub.keys?.p256dh!=="string")return fail("This device did not send a valid notification subscription.");await database().query(`INSERT INTO push_subscriptions(player_id,endpoint,subscription) VALUES($1,$2,$3::jsonb) ON CONFLICT(endpoint) DO UPDATE SET player_id=EXCLUDED.player_id,subscription=EXCLUDED.subscription,created_at=now()`,[user.id,sub.endpoint,JSON.stringify(sub)]);return json({ok:true});}
    if(action==="push/unsubscribe"){const data=await body(request);const endpoint=typeof data.endpoint==="string"?data.endpoint:"";await database().query(`DELETE FROM push_subscriptions WHERE player_id=$1 AND endpoint=$2`,[user.id,endpoint]);return json({ok:true});}
    return fail("That trail leads nowhere.",404);
  }catch(e){if(e instanceof RequestError)return fail(e.message,e.status);if(e instanceof SyntaxError|| (e instanceof Error&&e.message==="Send a valid form and try again."))return fail(e.message);if(dbUnavailable(e))return fail("Online play is being prepared. Practice mode is ready on this device.",503);console.error("Game API error:",e instanceof Error?e.message:"unknown");return fail("That didn’t save properly. Please try again.",500);}
}

export async function PATCH(request:NextRequest,{params}:{params:Promise<{path:string[]}>}){return POST(request,{params});}

