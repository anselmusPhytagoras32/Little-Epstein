export const MAX_BOSS_HP = 2700;
export type BossStage = "human" | "transformed" | "enraged" | "defeated";

export const BASE_BOSS_HEALTH: Record<string, number> = {
  kirkify: 15000, // 5+ minutes
  diddy: 32000,   // 10+ minutes
  epstein: 50000, // 15+ minutes
};

export const TARGET_RAID_DURATION_SECONDS: Record<string, number> = {
  kirkify: 300, // 5 minutes
  diddy: 600,   // 10 minutes
  epstein: 900, // 15 minutes
};

export function getScaledBossHp(opponent: string, squadCount: number): number {
  const base = BASE_BOSS_HEALTH[opponent] || 15000;
  return base * Math.max(1, Math.min(20, Math.floor(squadCount)));
}
/** The endurance shield gives the boss its advertised minimum fight length. */
export function bossHealthFloor(maxHp: number, elapsedSeconds: number, targetSeconds: number): number {
  if (elapsedSeconds >= targetSeconds) return 0;
  return Math.max(1, Math.ceil(maxHp * (1 - Math.max(0, elapsedSeconds) / targetSeconds)));
}

/** Encounter phases advance at boss health thresholds. */
export function bossStage(hp: number, maxHp: number = MAX_BOSS_HP): BossStage {
  if (hp <= 0) return "defeated";
  const ceiling = maxHp || MAX_BOSS_HP;
  if (hp <= ceiling / 3) return "enraged";
  if (hp <= (ceiling * 2) / 3) return "transformed";
  return "human";
}

