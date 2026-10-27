import type { AvatarAccent, AvatarId } from "./avatars";

export type BossId = "tumz" | "mabs" | "epstein";

export interface BossConfig {
  id: BossId;
  name: string;
  title: string;
  day: number;
  maxHp: number;
  themeColor: string;
  accentColor: string;
  placeholderIcon: string;
  customImagePath: string;
  description: string;
  attackSpeed: number; // Attack interval ms
  projectileType: "coconuts" | "lasers" | "money-bombs";
  bulletSpeed: number;
}

export const BOSS_CONFIGS: Record<BossId, BossConfig> = {
  tumz: {
    id: "tumz",
    name: "Kirkify",
    title: "Coastal Enforcer",
    day: 10,
    maxHp: 2700,
    themeColor: "#c477f2", // Purple
    accentColor: "#f3e8ff",
    placeholderIcon: "K",
    customImagePath: "/images/Kirk%20Sprite%20Sheet.png",
    description: "The ferocious coastal enforcer armed with void claw strikes, energy waves, and demonic transformation! Requires at least 3 persons to defeat.",
    attackSpeed: 1400,
    projectileType: "coconuts",
    bulletSpeed: 3.5,
  },
  mabs: {
    id: "mabs",
    name: "Diddy",
    title: "Island Horror Overseer",
    day: 20,
    maxHp: 3600,
    themeColor: "#f77885", // Coral Crimson
    accentColor: "#ffe4e6",
    placeholderIcon: "D",
    customImagePath: "/images/Diddy%20Sprite%20Sheet.png",
    description: "Horrific mutated overseer with conch-shell armor, razor fangs, and corrupted island projectiles! Requires at least 3 persons to defeat.",
    attackSpeed: 1100,
    projectileType: "lasers",
    bulletSpeed: 4.5,
  },
  epstein: {
    id: "epstein",
    name: "Epstein",
    title: "Island Overlord",
    day: 30,
    maxHp: 4500,
    themeColor: "#ff925e", // Amber Orange
    accentColor: "#ffedd5",
    placeholderIcon: "E",
    customImagePath: "/images/Epstein%20Sprite%20Sheet.png",
    description: "The ultimate eldritch island overlord! Unleashes demonic heart-core blasts, blood mouth beams, and tentacle eruptions! Requires at least 3 persons to defeat.",
    attackSpeed: 800,
    projectileType: "money-bombs",
    bulletSpeed: 5.2,
  },
};

export const BOSS_LIST: BossId[] = ["tumz", "mabs", "epstein"];

export interface BossRaidParticipant {
  id: string;
  name: string;
  avatarId?: AvatarId;
  avatarAccent?: AvatarAccent;
  damage: number;
  timestamp: number;
}

export interface BossBattleState {
  currentBossId: BossId;
  bossHp: Record<BossId, number>;
  defeated: Record<BossId, boolean>;
  participants: BossRaidParticipant[];
  reviveAvailable: boolean;
  progressLost: number;
  soundEnabled: boolean;
}

export const DEFAULT_BOSS_STATE: BossBattleState = {
  currentBossId: "tumz",
  bossHp: {
    tumz: 2700,
    mabs: 3600,
    epstein: 4500,
  },
  defeated: {
    tumz: false,
    mabs: false,
    epstein: false,
  },
  participants: [],
  reviveAvailable: true,
  progressLost: 0,
  soundEnabled: true,
};

const STORAGE_KEY = "escape-boss-battle-v3";
const EVENT_NAME = "escape-boss-updated";

export function getRequiredCrewCount(totalCrew: number): number {
  return Math.max(3, Math.ceil(Math.max(1, totalCrew) * 0.3));
}

export function loadBossBattleState(): BossBattleState {
  if (typeof window === "undefined") return DEFAULT_BOSS_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BOSS_STATE;
    const parsed = JSON.parse(raw);
    const validBossId: BossId = BOSS_LIST.includes(parsed.currentBossId) ? parsed.currentBossId : "tumz";

    return {
      currentBossId: validBossId,
      bossHp: {
        tumz: typeof parsed.bossHp?.tumz === "number" ? parsed.bossHp.tumz : 2700,
        mabs: typeof parsed.bossHp?.mabs === "number" ? parsed.bossHp.mabs : 3600,
        epstein: typeof parsed.bossHp?.epstein === "number" ? parsed.bossHp.epstein : 4500,
      },
      defeated: {
        tumz: parsed.defeated?.tumz === true,
        mabs: parsed.defeated?.mabs === true,
        epstein: parsed.defeated?.epstein === true,
      },
      participants: Array.isArray(parsed.participants) ? parsed.participants : [],
      reviveAvailable: parsed.reviveAvailable !== false,
      progressLost: typeof parsed.progressLost === "number" ? parsed.progressLost : 0,
      soundEnabled: parsed.soundEnabled !== false,
    };
  } catch {
    return DEFAULT_BOSS_STATE;
  }
}

export function saveBossBattleState(state: BossBattleState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }));
  } catch {
    // Graceful fallback for restricted storage
  }
}

export function subscribeToBossBattle(callback: (state: BossBattleState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<BossBattleState>;
    callback(custom.detail || loadBossBattleState());
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
