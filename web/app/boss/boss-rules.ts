export const MAX_BOSS_HP = 2700;
export type BossStage = "human" | "transformed" | "enraged" | "defeated";

/** Internal encounter state, intentionally never displayed as a health percentage.
 * Progresses by boss damage thresholds; requires 3 persons to penetrate and defeat.
 */
export function bossStage(hp: number, maxHp: number = MAX_BOSS_HP): BossStage {
  if (hp <= 0) return "defeated";
  const ceiling = maxHp || MAX_BOSS_HP;
  if (hp <= ceiling / 3) return "enraged";
  if (hp <= (ceiling * 2) / 3) return "transformed";
  return "human";
}

