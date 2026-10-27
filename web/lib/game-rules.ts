export const GAME_START = "2026-11-01";
export const GAME_END = "2026-11-30";
export const ROOM_LIMIT = 20;

/** Return the YYYY-MM-DD calendar date for a named IANA timezone. */
export function localDateKey(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);

  return `${value(parts, "year")}-${value(parts, "month")}-${value(parts, "day")}`;
}

/** Number of full game days currently elapsed, clamped to November 1–30. */
export function gameDay(dateKey: string): number {
  if (dateKey < GAME_START) return 0;
  if (dateKey > GAME_END) return 30;
  return Math.floor((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${GAME_START}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Calculate the consecutive check-in streak ending on the supplied date. */
export function consecutiveStreak(checkIns: Iterable<string>, today: string): number {
  const days = new Set(checkIns);
  let streak = 0;
  let cursor = Date.parse(`${today}T00:00:00Z`);
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= 86_400_000;
  }
  return streak;
}

/** Canonical invite parser; clients never choose the invite's resulting room. */
export function inviteToken(value: string): string | null {
  return /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : null;
}

function value(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}
