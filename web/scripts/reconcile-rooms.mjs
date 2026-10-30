// A single transaction and the member row locks keep sweeps and check-ins ordered.
export async function reconcileRooms(client, at = new Date()) {
  await client.query(`UPDATE rooms SET phase='active' WHERE phase='open' AND ($1::timestamptz AT TIME ZONE timezone)::date BETWEEN date '2026-11-01' AND date '2026-11-30'`, [at]);
  const eliminated = await client.query(
    `UPDATE room_members m SET status='eliminated', eliminated_on=missed.day, eliminated_reason='missed_checkin'
     FROM rooms r,
       (SELECT member.room_id, member.player_id, min(days.day)::date AS day
        FROM room_members member JOIN rooms room ON room.id=member.room_id
        CROSS JOIN LATERAL generate_series(date '2026-11-01', LEAST(date '2026-11-30', ($1::timestamptz AT TIME ZONE room.timezone)::date - 1), interval '1 day') days(day)
        WHERE member.status='alive' AND room.phase IN ('open','active')
          AND NOT EXISTS (SELECT 1 FROM daily_checkins c WHERE c.room_id=member.room_id AND c.player_id=member.player_id AND c.game_date=days.day::date)
        GROUP BY member.room_id, member.player_id) missed
     WHERE r.id=m.room_id AND m.status='alive' AND missed.room_id=m.room_id AND missed.player_id=m.player_id
     RETURNING m.room_id,m.player_id,m.eliminated_on AS game_date`, [at]);
  for (const player of eliminated.rows) {
    await client.query(`INSERT INTO room_events(room_id,player_id,event_type,game_date) VALUES($1,$2,'eliminated',$3)`, [player.room_id,player.player_id,player.game_date]);
  }
  await client.query(`UPDATE room_members m SET status='won' FROM rooms r WHERE r.id=m.room_id AND r.phase IN ('open','active') AND m.status='alive' AND ($1::timestamptz AT TIME ZONE r.timezone)::date > date '2026-11-30'`, [at]);
  await client.query(`UPDATE rooms SET phase='complete' WHERE phase IN ('open','active') AND ($1::timestamptz AT TIME ZONE timezone)::date > date '2026-11-30'`, [at]);
  return eliminated.rowCount ?? 0;
}
