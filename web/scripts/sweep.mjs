import pg from "pg";
import webpush from "web-push";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run the daily check-in sweep.");
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 15_000, statement_timeout: 20_000, application_name: "get-out-daily-sweep" });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE rooms SET phase='active' WHERE phase='open' AND (now() AT TIME ZONE timezone)::date BETWEEN date '2026-11-01' AND date '2026-11-30'`);
      const eliminated = await client.query(
        `UPDATE room_members m SET status='eliminated',eliminated_on=((now() AT TIME ZONE r.timezone)::date-1),eliminated_reason='missed_checkin'
         FROM rooms r WHERE r.id=m.room_id AND r.phase='active' AND m.status='alive'
         AND (now() AT TIME ZONE r.timezone)::date > date '2026-11-01'
         AND NOT EXISTS (SELECT 1 FROM daily_checkins c WHERE c.room_id=r.id AND c.player_id=m.player_id AND c.game_date=((now() AT TIME ZONE r.timezone)::date-1))
         RETURNING r.id AS room_id,m.player_id,r.timezone,((now() AT TIME ZONE r.timezone)::date-1) AS game_date`,
      );
      for (const player of eliminated.rows) {
        await client.query(`INSERT INTO room_events(room_id,player_id,event_type,game_date) VALUES($1,$2,'eliminated',$3)`,[player.room_id,player.player_id,player.game_date]);
      }
      await client.query(`UPDATE room_members m SET status='won' FROM rooms r WHERE r.id=m.room_id AND r.phase='active' AND m.status='alive' AND (now() AT TIME ZONE r.timezone)::date > date '2026-11-30'`);
      await client.query(`UPDATE rooms SET phase='complete' WHERE phase='active' AND (now() AT TIME ZONE timezone)::date > date '2026-11-30'`);

      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT?.startsWith("mailto:")) {
        const pending = await client.query(
          `SELECT p.id AS player_id,p.username,r.id AS room_id,r.name AS room_name,r.timezone,
                  (now() AT TIME ZONE r.timezone)::date AS game_date,
                  ps.id AS subscription_id,ps.endpoint,ps.subscription
           FROM players p JOIN room_members m ON m.player_id=p.id AND m.status='alive'
           JOIN rooms r ON r.id=m.room_id AND r.phase='active'
           JOIN push_subscriptions ps ON ps.player_id=p.id
           WHERE p.reminders_enabled AND p.reminder_time IS NOT NULL
             AND to_char(now() AT TIME ZONE p.timezone,'HH24:MI') >= to_char(p.reminder_time,'HH24:MI')
             AND (now() AT TIME ZONE r.timezone)::date BETWEEN date '2026-11-01' AND date '2026-11-30'
             AND NOT EXISTS (SELECT 1 FROM daily_checkins c WHERE c.room_id=r.id AND c.player_id=p.id AND c.game_date=(now() AT TIME ZONE r.timezone)::date)
             AND NOT EXISTS (SELECT 1 FROM reminder_dispatches d WHERE d.player_id=p.id AND d.room_id=r.id AND d.game_date=(now() AT TIME ZONE r.timezone)::date AND d.sent_at IS NOT NULL)
           ORDER BY p.id,r.id,ps.id LIMIT 300 FOR UPDATE OF p SKIP LOCKED`,
        );
        await client.query("COMMIT");
        webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
        for (const row of pending.rows) {
          const claim=await pool.query(`INSERT INTO reminder_dispatches(player_id,room_id,game_date,subscription_id,sent_at) VALUES($1,$2,$3,$4,NULL) ON CONFLICT(player_id,room_id,game_date,subscription_id) DO UPDATE SET created_at=now() WHERE reminder_dispatches.sent_at IS NULL AND reminder_dispatches.created_at<now()-interval '10 minutes' RETURNING player_id`,[row.player_id,row.room_id,row.game_date,row.subscription_id]);
          if(!claim.rowCount)continue;
          try {
            await webpush.sendNotification(row.subscription,{title:`${row.room_name} is waiting for you`,body:"A little daily check-in keeps your escape moving. Log today before midnight.",url:"/"},{TTL:3600});
            await pool.query(`UPDATE reminder_dispatches SET sent_at=now() WHERE player_id=$1 AND room_id=$2 AND game_date=$3 AND subscription_id=$4`,[row.player_id,row.room_id,row.game_date,row.subscription_id]);
          } catch(error) {
            const status=error?.statusCode;
            if(status===404||status===410)await pool.query(`DELETE FROM push_subscriptions WHERE id=$1`,[row.subscription_id]);
            await pool.query(`DELETE FROM reminder_dispatches WHERE player_id=$1 AND room_id=$2 AND game_date=$3 AND subscription_id=$4 AND sent_at IS NULL`,[row.player_id,row.room_id,row.game_date,row.subscription_id]);
          }
        }
      } else await client.query("COMMIT");
      console.log(`Room sweep complete. ${eliminated.rowCount ?? 0} missed check-in${eliminated.rowCount===1?"":"s"} processed.`);
    } catch(error) { await client.query("ROLLBACK").catch(()=>{}); throw error; }
    finally { client.release(); }
  } catch(error) {
    console.error(`Scheduled game update failed: ${error instanceof Error?error.message:String(error)}`);
    process.exitCode = 1;
  } finally { await pool.end(); }
}
