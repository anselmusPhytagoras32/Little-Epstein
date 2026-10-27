"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useGame } from "../game-provider";
import type { AvatarId } from "../../lib/avatars";
import { bossStage, MAX_BOSS_HP, type BossStage } from "./boss-rules";
import { contraAudio } from "../../lib/contra-audio";
import { Volume2, VolumeX, Shield, Zap, Sparkles, Users } from "lucide-react";

const W = 960;
const H = 540;
type Phase = "ready" | "playing" | "won" | "lost";
type Opponent = "kirkify" | "diddy" | "epstein";

export interface Companion {
  id: string;
  name: string;
  avatarId: AvatarId;
  accent: string;
  offsetX: number;
  offsetY: number;
  shootTimer: number;
}

const opponents: Record<Opponent, { name: string; image: string; accent: string; title: string }> = {
  kirkify: {
    name: "Kirkify",
    image: "/images/Kirk%20Sprite%20Sheet.png",
    accent: "#c477f2",
    title: "Coastal Enforcer",
  },
  diddy: {
    name: "Diddy",
    image: "/images/Diddy%20Sprite%20Sheet.png",
    accent: "#f77885",
    title: "Island Horror Overseer",
  },
  epstein: {
    name: "Epstein",
    image: "/images/Epstein%20Sprite%20Sheet.png",
    accent: "#ff925e",
    title: "Island Overlord",
  },
};

type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  kind?: "wave" | "orb" | "pillar" | "tentacle" | "slash";
};
type Shot = { x: number; y: number; vx: number; vy: number };
type WarningZone = { x: number; y: number; radius: number; time: number; maxTime: number; type: "rush" | "pillar" | "tentacle" };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type FloatingText = {
  id: number;
  text: string;
  x: number;
  y: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
};

type PowerupType = "spread" | "shield" | "speed";
type Powerup = {
  id: number;
  x: number;
  y: number;
  type: PowerupType;
  radius: number;
  pulse: number;
};

type LaserTelegraph = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  chargeTimer: number;
  fireTimer: number;
};

type PhaseBanner = {
  text: string;
  subtext: string;
  color: string;
  timer: number;
  maxTimer: number;
};

type Battle = {
  squadCount: number;
  companions: Companion[];
  hp: number;
  bossHp: number;
  x: number;
  y: number;
  bossX: number;
  bossY: number;
  shots: Shot[];
  hazards: Projectile[];
  warnings: WarningZone[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  powerups: Powerup[];
  activePowerup: { type: PowerupType; timer: number } | null;
  banner: PhaseBanner | null;
  laser: LaserTelegraph | null;
  cooldown: number;
  spawn: number;
  rushClock: number;
  rushTime: number;
  rushX: number;
  rushY: number;
  laserClock: number;
  powerupSpawnTimer: number;
  spiralAngle: number;
  dashTimer: number;
  dashCooldown: number;
  dashVx: number;
  dashVy: number;
  dashTrail: { x: number; y: number; alpha: number }[];
  screenShake: number;
  screenShakeIntensity: number;
  bossFlashTimer: number;
  invulnerable: number;
  shotsFired: number;
  shotsLanded: number;
  hitsTaken: number;
  phase: Phase;
  stage: BossStage;
  animTimer: number;
  flinchTimer: number;
  transformProgress: number;
  isTransforming: boolean;
};

function fresh(squadCount: number = 3): Battle {
  const companions: Companion[] = [];
  if (squadCount >= 2) {
    companions.push({
      id: "kai",
      name: "Kai",
      avatarId: "sky",
      accent: "#38bdf8",
      offsetX: -46,
      offsetY: 14,
      shootTimer: 0.35,
    });
  }
  if (squadCount >= 3) {
    companions.push({
      id: "maya",
      name: "Maya",
      avatarId: "coral",
      accent: "#f43f5e",
      offsetX: 46,
      offsetY: 14,
      shootTimer: 0.55,
    });
  }

  return {
    squadCount,
    companions,
    hp: 100,
    bossHp: MAX_BOSS_HP,
    x: W / 2,
    y: H - 100,
    bossX: W / 2,
    bossY: 130,
    shots: [],
    hazards: [],
    warnings: [],
    particles: [],
    floatingTexts: [],
    powerups: [],
    activePowerup: null,
    banner: null,
    laser: null,
    cooldown: 0,
    spawn: 1.2,
    rushClock: 8,
    rushTime: 0,
    rushX: 0,
    rushY: 0,
    laserClock: 9,
    powerupSpawnTimer: 10,
    spiralAngle: 0,
    dashTimer: 0,
    dashCooldown: 0,
    dashVx: 0,
    dashVy: 0,
    dashTrail: [],
    screenShake: 0,
    screenShakeIntensity: 0,
    bossFlashTimer: 0,
    invulnerable: 0,
    shotsFired: 0,
    shotsLanded: 0,
    hitsTaken: 0,
    phase: "ready",
    stage: "human",
    animTimer: 0,
    flinchTimer: 0,
    transformProgress: 0,
    isTransforming: false,
  };
}

const portraits: Record<AvatarId, [number, number]> = {
  fern: [40, 150],
  coral: [390, 150],
  sky: [735, 150],
  sun: [1095, 150],
  builder: [35, 625],
  scout: [385, 625],
  chef: [735, 625],
  diver: [1090, 625],
};

type Frame = [number, number, number, number]; // [sx, sy, sw, sh]

interface BossSpriteSheetMap {
  humanIdle: Frame[];
  humanWalk: Frame[];
  humanAttack: Frame[];
  humanHit: Frame[];
  transform: Frame[];
  phase2Idle: Frame[];
  phase2Attack: Frame[];
  phase2Enraged: Frame[];
  defeated: Frame[];
}

const SPRITE_MAPS: Record<Opponent, BossSpriteSheetMap> = {
  kirkify: {
    humanIdle: [
      [29, 69, 41, 85],
      [96, 70, 38, 84],
      [159, 71, 40, 83],
      [220, 71, 39, 83],
      [278, 71, 39, 83],
    ],
    humanWalk: [
      [346, 68, 43, 86],
      [400, 69, 45, 85],
      [453, 69, 47, 85],
      [511, 69, 41, 85],
      [555, 69, 46, 85],
      [608, 69, 40, 85],
    ],
    humanAttack: [
      [21, 202, 53, 106],
      [94, 202, 65, 106],
      [165, 202, 75, 106],
      [245, 202, 85, 106],
      [335, 202, 90, 106],
      [430, 202, 90, 106],
    ],
    humanHit: [
      [26, 330, 58, 104],
      [104, 347, 53, 87],
      [175, 336, 75, 98],
    ],
    transform: [
      [10, 470, 140, 200],
      [150, 470, 150, 200],
      [300, 470, 160, 200],
      [460, 481, 170, 189],
      [630, 473, 170, 197],
      [800, 470, 220, 200],
      [1020, 470, 500, 200],
    ],
    phase2Idle: [
      [16, 700, 274, 140],
      [290, 704, 220, 131],
      [510, 704, 205, 127],
      [717, 722, 212, 111],
    ],
    phase2Attack: [
      [16, 700, 274, 140],
      [290, 704, 220, 131],
      [510, 704, 205, 127],
    ],
    phase2Enraged: [
      [12, 845, 143, 147],
      [155, 845, 145, 148],
      [300, 845, 115, 148],
      [415, 845, 185, 150],
    ],
    defeated: [
      [600, 845, 150, 150],
      [750, 845, 180, 143],
      [930, 845, 220, 150],
    ],
  },
  diddy: {
    humanIdle: [
      [32, 48, 74, 127],
      [126, 48, 74, 127],
      [221, 48, 73, 127],
      [316, 48, 73, 127],
      [411, 48, 74, 127],
    ],
    humanWalk: [
      [521, 48, 81, 127],
      [619, 48, 76, 127],
      [715, 48, 71, 127],
      [804, 48, 75, 127],
      [890, 48, 80, 127],
    ],
    humanAttack: [
      [1004, 48, 93, 127],
      [1113, 48, 100, 127],
      [1223, 48, 95, 127],
      [1320, 48, 95, 127],
      [1420, 48, 95, 127],
    ],
    humanHit: [
      [27, 241, 101, 124],
      [153, 242, 99, 123],
      [274, 238, 89, 127],
      [393, 238, 92, 127],
    ],
    transform: [
      [22, 429, 103, 141],
      [134, 433, 129, 137],
      [268, 427, 123, 143],
      [395, 419, 139, 151],
      [536, 415, 137, 155],
      [677, 415, 156, 155],
      [841, 415, 152, 155],
      [1003, 415, 169, 155],
      [1180, 415, 157, 155],
      [1339, 415, 179, 155],
    ],
    phase2Idle: [
      [23, 619, 145, 170],
      [178, 615, 164, 175],
      [349, 615, 173, 175],
      [531, 615, 160, 175],
    ],
    phase2Attack: [
      [723, 621, 181, 169],
      [912, 618, 190, 172],
      [1110, 618, 180, 172],
      [1296, 620, 222, 170],
    ],
    phase2Enraged: [
      [22, 847, 162, 148],
      [197, 843, 157, 152],
      [364, 843, 177, 152],
      [547, 843, 199, 152],
    ],
    defeated: [
      [787, 859, 135, 131],
      [945, 889, 162, 106],
      [1124, 866, 167, 126],
      [1304, 870, 201, 123],
    ],
  },
  epstein: {
    humanIdle: [
      [34, 113, 83, 147],
      [135, 110, 84, 150],
      [240, 113, 79, 147],
      [345, 113, 81, 147],
    ],
    humanWalk: [
      [483, 110, 64, 150],
      [556, 111, 72, 149],
      [635, 111, 74, 149],
      [721, 112, 75, 148],
      [804, 111, 66, 149],
      [881, 111, 81, 149],
    ],
    humanAttack: [
      [1004, 112, 111, 148],
      [1130, 110, 113, 150],
      [1250, 110, 120, 150],
      [1380, 110, 135, 150],
    ],
    humanHit: [
      [26, 307, 78, 158],
      [117, 307, 75, 158],
      [205, 307, 85, 158],
      [285, 307, 85, 158],
    ],
    transform: [
      [412, 306, 92, 159],
      [516, 305, 92, 160],
      [620, 308, 92, 157],
      [719, 308, 116, 157],
      [860, 305, 135, 160],
      [1010, 305, 160, 160],
    ],
    phase2Idle: [
      [22, 523, 169, 237],
      [202, 524, 156, 236],
      [361, 528, 150, 232],
      [513, 524, 151, 236],
    ],
    phase2Attack: [
      [694, 520, 165, 240],
      [870, 520, 150, 240],
      [1030, 520, 160, 240],
      [1200, 520, 160, 240],
    ],
    phase2Enraged: [
      [18, 815, 175, 180],
      [205, 815, 175, 180],
      [390, 815, 175, 180],
      [580, 815, 185, 180],
    ],
    defeated: [
      [806, 815, 119, 164],
      [958, 815, 142, 160],
      [1139, 815, 160, 165],
      [1310, 815, 195, 165],
    ],
  },
};

export default function BossEncounter({
  initialOpponent = "kirkify",
}: {
  initialOpponent?: Opponent;
}) {
  const game = useGame();
  const canvas = useRef<HTMLCanvasElement>(null);
  const joystick = useRef<HTMLButtonElement>(null);
  const images = useRef<{ boss?: HTMLImageElement; avatar?: HTMLImageElement }>({});
  const battle = useRef<Battle>(fresh());
  const controls = useRef({ x: 0, y: 0, attack: false, keys: new Set<string>() });
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [phase, setPhase] = useState<Phase>("ready");
  const [opponent, setOpponent] = useState<Opponent>(initialOpponent);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dashReady, setDashReady] = useState(true);
  const [activePowerupUi, setActivePowerupUi] = useState<string | null>(null);
  const [squadCount, setSquadCount] = useState<number>(3);
  const [hud, setHud] = useState<{ hp: number; stage: BossStage; squadCount: number }>({
    hp: 100,
    stage: "human",
    squadCount: 3,
  });
  const [results, setResults] = useState<{
    squadCount: number;
    shotsLanded: number;
    shotsFired: number;
    hitsTaken: number;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("opponent");
    if (requested === "kirkify" || requested === "diddy" || requested === "epstein") {
      setOpponent(requested);
    }
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    contraAudio.setEnabled(next);
  };

  // Sprite Sheets Loader
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setLoadError(false);

    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error(`Failed to load ${src}`));
        img.src = src;
        if (img.complete && img.naturalWidth > 0) resolve(img);
      });
    };

    Promise.all([
      loadImage(opponents[opponent].image),
      loadImage("/images/Pixel-Art%20Base%20Avatar%20Selection%20Sheet.png"),
    ])
      .then(([boss, avatar]) => {
        if (!active) return;
        images.current = { boss, avatar };
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, [opponent]);

  const finish = useCallback((result: "won" | "lost") => {
    battle.current.phase = result;
    controls.current.attack = false;
    const finalStage = bossStage(battle.current.bossHp);
    battle.current.stage = finalStage;
    if (result === "won") {
      contraAudio.playVictory();
    } else {
      contraAudio.playExplosion();
    }
    setResults({
      squadCount: battle.current.squadCount,
      shotsLanded: battle.current.shotsLanded,
      shotsFired: battle.current.shotsFired,
      hitsTaken: battle.current.hitsTaken,
    });
    setHud({
      hp: battle.current.hp,
      stage: finalStage,
      squadCount: battle.current.squadCount,
    });
    setPhase(result);
  }, []);

  useEffect(() => () => { screen.orientation?.unlock?.(); }, []);

  const triggerDash = useCallback(() => {
    const state = battle.current;
    if (state.phase !== "playing" || state.dashCooldown > 0) return;
    state.dashCooldown = 1.6;
    state.dashTimer = 0.28;
    state.invulnerable = Math.max(state.invulnerable, 0.42);

    const held = controls.current.keys;
    let dx = controls.current.x + Number(held.has("arrowright") || held.has("d")) - Number(held.has("arrowleft") || held.has("a"));
    let dy = controls.current.y + Number(held.has("arrowdown") || held.has("s")) - Number(held.has("arrowup") || held.has("w"));
    const mag = Math.hypot(dx, dy);

    if (mag > 0.1) {
      state.dashVx = (dx / mag) * 580;
      state.dashVy = (dy / mag) * 580;
    } else {
      state.dashVx = 0;
      state.dashVy = -580;
    }

    contraAudio.playDash();

    // Spawn splash burst
    for (let i = 0; i < 12; i++) {
      state.particles.push({
        x: state.x + (Math.random() - 0.5) * 20,
        y: state.y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 160 - state.dashVx * 0.15,
        vy: (Math.random() - 0.5) * 160 - state.dashVy * 0.15,
        life: 0.35,
        maxLife: 0.35,
        color: "#93c5fd",
        size: 3 + Math.random() * 4,
      });
    }

    state.floatingTexts.push({
      id: Math.random(),
      text: "DODGE!",
      x: state.x,
      y: state.y - 28,
      vy: -50,
      alpha: 1,
      color: "#67e8f9",
      size: 13,
    });
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "].includes(key)) {
        event.preventDefault();
      }
      if (key === "shift" || key === "k") {
        event.preventDefault();
        triggerDash();
      }
      controls.current.keys.add(key);
    };
    const up = (event: KeyboardEvent) => controls.current.keys.delete(event.key.toLowerCase());
    const clear = () => {
      controls.current.keys.clear();
      controls.current.x = 0;
      controls.current.y = 0;
      controls.current.attack = false;
      pointer.current = null;
      setKnob({ x: 0, y: 0 });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [triggerDash]);

  // Main Encounter Engine
  useEffect(() => {
    if (phase !== "playing") return;
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let last = 0;
    let displayAt = 0;

    const render = (now: number) => {
      const state = battle.current;
      if (state.phase !== "playing") return;
      if (document.hidden) {
        last = now;
        frame = requestAnimationFrame(render);
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;

      state.animTimer += dt;
      if (state.flinchTimer > 0) state.flinchTimer -= dt;
      if (state.bossFlashTimer > 0) state.bossFlashTimer -= dt;
      if (state.screenShake > 0) state.screenShake -= dt;

      // Update Active Powerup
      if (state.activePowerup) {
        state.activePowerup.timer -= dt;
        if (state.activePowerup.timer <= 0) {
          state.activePowerup = null;
        }
      }

      // Update Dash
      if (state.dashTimer > 0) {
        state.dashTimer -= dt;
        state.x = Math.max(35, Math.min(W - 35, state.x + state.dashVx * dt));
        state.y = Math.max(100, Math.min(H - 38, state.y + state.dashVy * dt));
        state.dashTrail.push({ x: state.x, y: state.y, alpha: 0.65 });
      }
      if (state.dashCooldown > 0) {
        state.dashCooldown -= dt;
      }
      state.dashTrail = state.dashTrail
        .map((t) => ({ ...t, alpha: t.alpha - dt * 2.5 }))
        .filter((t) => t.alpha > 0);

      // Current stage evaluation based on boss HP
      const currentStage = bossStage(state.bossHp);
      if (state.stage !== currentStage) {
        if (currentStage === "transformed" && state.stage === "human") {
          state.isTransforming = true;
          state.transformProgress = 0;
          state.screenShake = 0.6;
          state.screenShakeIntensity = 7;
          contraAudio.playPhaseRoar();
          state.banner = {
            text: "PHASE 2: UNLEASHED",
            subtext: `${opponents[opponent].name} enters monstrous form!`,
            color: opponents[opponent].accent,
            timer: 2.2,
            maxTimer: 2.2,
          };
        } else if (currentStage === "enraged") {
          state.screenShake = 0.8;
          state.screenShakeIntensity = 10;
          contraAudio.playPhaseRoar();
          state.banner = {
            text: "⚠️ MAXIMUM OVERDRIVE ⚠️",
            subtext: "Dodge the aggressive storm barrage!",
            color: "#f87171",
            timer: 2.0,
            maxTimer: 2.0,
          };
        } else if (currentStage === "defeated") {
          state.screenShake = 0.6;
          state.screenShakeIntensity = 8;
          contraAudio.playExplosion();
          state.banner = {
            text: "💥 BOSS DOWN! 💥",
            subtext: "Squad victory achieved!",
            color: "#34d399",
            timer: 2.5,
            maxTimer: 2.5,
          };
        }
        state.stage = currentStage;
      }

      if (state.isTransforming) {
        state.transformProgress += dt * 0.45;
        if (state.transformProgress >= 1) {
          state.isTransforming = false;
        }
      }

      // Update Phase Banner
      if (state.banner) {
        state.banner.timer -= dt;
        if (state.banner.timer <= 0) state.banner = null;
      }

      const held = controls.current.keys;

      // Player Movement (when not dashing)
      if (state.dashTimer <= 0) {
        let dx =
          controls.current.x +
          Number(held.has("arrowright") || held.has("d")) -
          Number(held.has("arrowleft") || held.has("a"));
        let dy =
          controls.current.y +
          Number(held.has("arrowdown") || held.has("s")) -
          Number(held.has("arrowup") || held.has("w"));
        const magnitude = Math.hypot(dx, dy);
        if (magnitude > 1) {
          dx /= magnitude;
          dy /= magnitude;
        }
        const speedMultiplier = state.activePowerup?.type === "speed" ? 1.4 : 1.0;
        state.x = Math.max(35, Math.min(W - 35, state.x + dx * 240 * speedMultiplier * dt));
        state.y = Math.max(100, Math.min(H - 38, state.y + dy * 240 * speedMultiplier * dt));
      }

      // Update Squad Companions (swim and fire alongside player)
      state.companions.forEach((comp) => {
        comp.shootTimer -= dt;
        if (comp.shootTimer <= 0 && state.bossHp > 0 && !state.isTransforming) {
          comp.shootTimer = 0.38 + Math.random() * 0.24;
          const compX = state.x + comp.offsetX;
          const compY = state.y + comp.offsetY;
          const dist = Math.hypot(state.bossX - compX, state.bossY - compY) || 1;
          state.shots.push({
            x: compX,
            y: compY - 12,
            vx: ((state.bossX - compX) / dist) * 620,
            vy: ((state.bossY - compY) / dist) * 620,
          });
          state.shotsFired += 1;
          contraAudio.playShoot();
        }
      });

      // Boss shield regeneration if squad is under 3 persons (impossible to solo/duo)
      if (state.squadCount < 3 && state.bossHp < MAX_BOSS_HP && state.bossHp > 0) {
        state.bossHp = Math.min(MAX_BOSS_HP, state.bossHp + 25 * dt);
      }

      state.invulnerable = Math.max(0, state.invulnerable - dt);
      state.cooldown -= dt;
      state.spawn -= dt;
      state.rushClock -= dt;
      state.laserClock -= dt;

      const elapsed = state.animTimer;
      const isPhaseTwo = state.stage === "transformed" || state.stage === "enraged";
      const isEnraged = state.stage === "enraged";

      // Boss Movement & Rushes
      if (state.rushClock <= 0 && state.rushTime <= 0 && !state.isTransforming && state.bossHp > 0) {
        state.rushX = state.x;
        state.rushY = state.y;
        state.rushTime = 2.1;
        state.rushClock = isEnraged ? 6 : isPhaseTwo ? 8 : 11;
        contraAudio.playLaser();
      }

      if (state.rushTime > 0) {
        state.rushTime = Math.max(0, state.rushTime - dt);
        if (state.rushTime < 1.25) {
          const distance = Math.hypot(state.rushX - state.bossX, state.rushY - state.bossY) || 1;
          const step = Math.min(distance, (isEnraged ? 360 : 310) * dt);
          state.bossX += ((state.rushX - state.bossX) / distance) * step;
          state.bossY += ((state.rushY - state.bossY) / distance) * step;
        }
      } else if (!state.isTransforming && state.bossHp > 0) {
        const swayWidth = isEnraged ? 260 : isPhaseTwo ? 220 : 180;
        const targetX = W / 2 + Math.sin(elapsed * 0.8) * swayWidth;
        const targetY = (isPhaseTwo ? 140 : 120) + Math.sin(elapsed * 1.3) * 25;
        state.bossX += (targetX - state.bossX) * Math.min(1, dt * 1.8);
        state.bossY += (targetY - state.bossY) * Math.min(1, dt * 1.8);
      }

      // Laser Beam Sweep Telegraph & Execution (Phase 2 & 3)
      if (isPhaseTwo && state.laserClock <= 0 && !state.laser && state.bossHp > 0) {
        state.laser = {
          x: state.bossX,
          y: state.bossY,
          targetX: state.x,
          targetY: state.y,
          chargeTimer: 1.1,
          fireTimer: 0.5,
        };
        state.laserClock = isEnraged ? 7.5 : 10.5;
        contraAudio.playLaser();
      }

      if (state.laser) {
        state.laser.x = state.bossX;
        state.laser.y = state.bossY + 25;
        if (state.laser.chargeTimer > 0) {
          state.laser.chargeTimer -= dt;
          // Slowly track player while charging
          state.laser.targetX += (state.x - state.laser.targetX) * dt * 2.2;
          state.laser.targetY += (state.y - state.laser.targetY) * dt * 2.2;
        } else if (state.laser.fireTimer > 0) {
          state.laser.fireTimer -= dt;
          state.screenShake = 0.2;
          state.screenShakeIntensity = 4;
          // Spawn laser beam hazard orbs (radius: 11) along the laser line
          if (state.laser.fireTimer > 0.42) {
            const angle = Math.atan2(state.laser.targetY - state.laser.y, state.laser.targetX - state.laser.x);
            for (let dist = 80; dist < 500; dist += 90) {
              state.hazards.push({
                x: state.laser.x + Math.cos(angle) * dist,
                y: state.laser.y + Math.sin(angle) * dist,
                vx: Math.cos(angle + 1.57) * 40,
                vy: Math.sin(angle + 1.57) * 40,
                radius: 11,
              });
            }
          }
          if (state.laser.fireTimer <= 0) {
            state.laser = null;
          }
        }
      }

      // Boss Attack Spawns (radius: 11 for test compatibility)
      if (state.spawn <= 0 && state.bossHp > 0 && !state.isTransforming) {
        state.spawn = isEnraged ? 0.65 : isPhaseTwo ? 0.9 : 1.35;
        const angle = Math.atan2(state.y - state.bossY, state.x - state.bossX);

        if (isEnraged) {
          // 5-way barrage
          for (const offset of [-0.4, -0.2, 0, 0.2, 0.4]) {
            state.hazards.push({
              x: state.bossX,
              y: state.bossY + 25,
              vx: Math.cos(angle + offset) * 190,
              vy: Math.sin(angle + offset) * 190,
              radius: 11,
            });
          }
          // Extra spiral orb
          state.spiralAngle += 0.55;
          state.hazards.push({
            x: state.bossX,
            y: state.bossY + 25,
            vx: Math.cos(state.spiralAngle) * 160,
            vy: Math.sin(state.spiralAngle) * 160,
            radius: 11,
          });
        } else if (isPhaseTwo) {
          // 3-way spread
          for (const offset of [-0.25, 0, 0.25]) {
            state.hazards.push({
              x: state.bossX,
              y: state.bossY + 25,
              vx: Math.cos(angle + offset) * 175,
              vy: Math.sin(angle + offset) * 175,
              radius: 11,
            });
          }
        } else {
          // Phase 1 targeted hazard
          state.hazards.push({
            x: state.bossX,
            y: state.bossY + 20,
            vx: Math.cos(angle) * 165,
            vy: Math.sin(angle) * 165,
            radius: 11,
          });
        }
      }

      // Floating Powerups Spawner
      state.powerupSpawnTimer -= dt;
      if (state.powerupSpawnTimer <= 0 && state.phase === "playing") {
        state.powerupSpawnTimer = 16 + Math.random() * 8;
        const types: PowerupType[] = ["spread", "shield", "speed"];
        const chosen = types[Math.floor(Math.random() * types.length)];
        state.powerups.push({
          id: Math.random(),
          x: 90 + Math.random() * (W - 180),
          y: 130 + Math.random() * (H - 240),
          type: chosen,
          radius: 18,
          pulse: 0,
        });
      }

      // Check player collecting powerup
      state.powerups = state.powerups.filter((p) => {
        p.pulse += dt * 3;
        p.y += Math.sin(p.pulse) * 0.4;
        if (Math.hypot(state.x - p.x, state.y - p.y) < p.radius + 24) {
          state.activePowerup = {
            type: p.type,
            timer: p.type === "shield" ? 15 : 10,
          };
          contraAudio.playRevive();
          const label =
            p.type === "spread"
              ? "⚡ SPREAD SHOT!"
              : p.type === "shield"
              ? "🛡️ BUBBLE SHIELD!"
              : "💨 TURBO FINS!";
          state.floatingTexts.push({
            id: Math.random(),
            text: label,
            x: p.x,
            y: p.y - 20,
            vy: -50,
            alpha: 1,
            color: p.type === "spread" ? "#fde047" : p.type === "shield" ? "#60a5fa" : "#34d399",
            size: 14,
          });
          for (let i = 0; i < 16; i++) {
            state.particles.push({
              x: p.x,
              y: p.y,
              vx: (Math.random() - 0.5) * 180,
              vy: (Math.random() - 0.5) * 180,
              life: 0.45,
              maxLife: 0.45,
              color: "#fde047",
              size: 3 + Math.random() * 4,
            });
          }
          return false;
        }
        return true;
      });

      // Player Attack / Blaster Fire (radius: 5 for test compatibility)
      if (
        (controls.current.attack || held.has(" ") || held.has("j")) &&
        state.cooldown <= 0 &&
        state.bossHp > 0
      ) {
        state.cooldown = state.activePowerup?.type === "speed" ? 0.1 : 0.16;
        state.shotsFired += 1;
        contraAudio.playShoot();

        const distance = Math.hypot(state.bossX - state.x, state.bossY - state.y) || 1;
        const baseVx = ((state.bossX - state.x) / distance) * 620;
        const baseVy = ((state.bossY - state.y) / distance) * 620;

        state.shots.push({
          x: state.x,
          y: state.y - 12,
          vx: baseVx,
          vy: baseVy,
        });

        // Spread shot powerup fires 2 additional angled projectiles
        if (state.activePowerup?.type === "spread") {
          state.shotsFired += 2;
          const angle = Math.atan2(baseVy, baseVx);
          for (const off of [-0.22, 0.22]) {
            state.shots.push({
              x: state.x,
              y: state.y - 12,
              vx: Math.cos(angle + off) * 620,
              vy: Math.sin(angle + off) * 620,
            });
          }
        }
      }

      // Update Player Shots
      state.shots = state.shots.filter((shot) => {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        const hitDistance = isPhaseTwo ? 65 : 50;
        if (Math.hypot(shot.x - state.bossX, shot.y - state.bossY) < hitDistance) {
          const isCrit = state.shotsLanded % 5 === 0;
          let dmg = isCrit ? 25 : 15;
          const isShielded = state.squadCount < 3;
          if (isShielded) {
            dmg = 1; // 93% damage deflected without 3-person squad
          }
          state.bossHp = Math.max(0, state.bossHp - dmg);
          state.shotsLanded += 1;
          state.flinchTimer = 0.12;
          state.bossFlashTimer = 0.14;
          contraAudio.playBossHit();

          // Spark particles
          for (let i = 0; i < 4; i++) {
            state.particles.push({
              x: shot.x,
              y: shot.y,
              vx: (Math.random() - 0.5) * 220,
              vy: (Math.random() - 0.5) * 220,
              life: 0.25,
              maxLife: 0.25,
              color: isShielded ? "#c084fc" : isCrit ? "#fde047" : "#fdba74",
              size: 2 + Math.random() * 3,
            });
          }

          return false;
        }
        return shot.x > -20 && shot.x < W + 20 && shot.y > -20 && shot.y < H + 20;
      });

      // Hit Player Function
      const hitPlayer = () => {
        if (state.invulnerable <= 0) {
          if (state.activePowerup?.type === "shield") {
            // Shield absorbs damage
            state.activePowerup = null;
            state.invulnerable = 0.8;
            contraAudio.playBossHit();
            state.floatingTexts.push({
              id: Math.random(),
              text: "SHIELD BLOCKED!",
              x: state.x,
              y: state.y - 30,
              vy: -45,
              alpha: 1,
              color: "#93c5fd",
              size: 14,
            });
            for (let i = 0; i < 18; i++) {
              state.particles.push({
                x: state.x,
                y: state.y,
                vx: (Math.random() - 0.5) * 220,
                vy: (Math.random() - 0.5) * 220,
                life: 0.35,
                maxLife: 0.35,
                color: "#60a5fa",
                size: 3 + Math.random() * 4,
              });
            }
            return;
          }

          state.hp = Math.max(0, state.hp - 20);
          state.hitsTaken += 1;
          state.invulnerable = 1.1;
          state.screenShake = 0.25;
          state.screenShakeIntensity = 6;
          contraAudio.playPlayerHit();

          state.floatingTexts.push({
            id: Math.random(),
            text: "-20 HP",
            x: state.x,
            y: state.y - 30,
            vy: -45,
            alpha: 1,
            color: "#f87171",
            size: 14,
          });
        }
      };

      // Update Boss Hazards
      state.hazards = state.hazards.filter((hazard) => {
        hazard.x += hazard.vx * dt;
        hazard.y += hazard.vy * dt;
        if (Math.hypot(hazard.x - state.x, hazard.y - state.y) < hazard.radius + 20) {
          hitPlayer();
          return false;
        }
        return hazard.x > -40 && hazard.x < W + 40 && hazard.y > -40 && hazard.y < H + 40;
      });

      // Check Boss Rush Collision
      if (
        state.rushTime > 0 &&
        state.rushTime < 1.25 &&
        Math.hypot(state.x - state.bossX, state.y - state.bossY) < (isPhaseTwo ? 65 : 55)
      ) {
        hitPlayer();
      }

      // Update Particles
      state.particles = state.particles
        .map((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          return p;
        })
        .filter((p) => p.life > 0);

      // Update Floating Texts
      state.floatingTexts = state.floatingTexts
        .map((ft) => {
          ft.y += ft.vy * dt;
          ft.alpha -= dt * 1.6;
          return ft;
        })
        .filter((ft) => ft.alpha > 0);

      // Outcome Evaluation
      if (state.hp <= 0) {
        finish("lost");
        return;
      }
      if (state.bossHp <= 0) {
        finish("won");
        return;
      }

      // --- RENDERING CANVAS ---
      ctx.save();

      // Screen Shake translation
      if (state.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * state.screenShakeIntensity * 2;
        const shakeY = (Math.random() - 0.5) * state.screenShakeIntensity * 2;
        ctx.translate(shakeX, shakeY);
      }

      // 1. Water Background with Dynamic Ripples
      const water = ctx.createLinearGradient(0, 0, 0, H);
      if (isEnraged) {
        water.addColorStop(0, "#2b0a1a");
        water.addColorStop(1, "#0d0408");
      } else if (isPhaseTwo) {
        water.addColorStop(0, "#191238");
        water.addColorStop(1, "#081d2a");
      } else {
        water.addColorStop(0, "#125e6b");
        water.addColorStop(1, "#083c52");
      }
      ctx.fillStyle = water;
      ctx.fillRect(-10, -10, W + 20, H + 20);

      // Water Caustics / Surface Highlights
      ctx.strokeStyle = isEnraged ? "#fca5a528" : isPhaseTwo ? "#c4b5fd25" : "#9cdedb30";
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i += 1) {
        const wx = (i * 105 + elapsed * 8) % W;
        const wy = 90 + (i * 77) % 410;
        ctx.beginPath();
        ctx.ellipse(wx, wy, 32, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Dash Trails (afterimages)
      state.dashTrail.forEach((t) => {
        ctx.fillStyle = `rgba(147, 197, 253, ${t.alpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 22, 0, Math.PI * 2);
        ctx.fill();
      });

      // Laser Telegraph Line & Beam
      if (state.laser) {
        if (state.laser.chargeTimer > 0) {
          // Warning laser line
          ctx.strokeStyle = `rgba(244, 63, 94, ${0.4 + Math.sin(state.animTimer * 20) * 0.3})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(state.laser.x, state.laser.y);
          ctx.lineTo(state.laser.targetX, state.laser.targetY);
          ctx.stroke();
          ctx.setLineDash([]);

          // Flashing reticle
          ctx.strokeStyle = "#f43f5e";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(state.laser.targetX, state.laser.targetY, 16, 0, Math.PI * 2);
          ctx.stroke();
        } else if (state.laser.fireTimer > 0) {
          // Firing beam
          ctx.strokeStyle = "#fecdd3";
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.moveTo(state.laser.x, state.laser.y);
          ctx.lineTo(state.laser.targetX, state.laser.targetY);
          ctx.stroke();

          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(state.laser.x, state.laser.y);
          ctx.lineTo(state.laser.targetX, state.laser.targetY);
          ctx.stroke();
        }
      }

      // Rush Telegraph Warning
      if (state.rushTime > 1.25) {
        ctx.strokeStyle = opponents[opponent].accent;
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(state.rushX, state.rushY, 60, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 2. Boss Sprite Rendering
      const sprite = images.current.boss;
      const spriteMap = SPRITE_MAPS[opponent];
      if (sprite?.complete && sprite.naturalWidth) {
        let frameRect: Frame;
        let drawWidth: number;
        let drawHeight: number;

        if (state.bossHp <= 0) {
          // Defeated animation
          const frames = spriteMap.defeated;
          const idx = Math.min(frames.length - 1, Math.floor(state.animTimer * 2) % frames.length);
          frameRect = frames[idx];
          drawWidth = 120;
          drawHeight = 110;
        } else if (state.isTransforming) {
          // Transformation sequence
          const frames = spriteMap.transform;
          const idx = Math.min(
            frames.length - 1,
            Math.floor(state.transformProgress * frames.length)
          );
          frameRect = frames[idx];
          drawWidth = 145;
          drawHeight = 135;

          // Radial transformation aura
          ctx.strokeStyle = opponents[opponent].accent;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(state.bossX, state.bossY, 70 + Math.sin(state.animTimer * 15) * 12, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isEnraged) {
          // Enraged state
          const frames = state.rushTime > 0 && state.rushTime < 1.25
            ? spriteMap.phase2Attack
            : spriteMap.phase2Enraged;
          const idx = Math.floor(state.animTimer * 5) % frames.length;
          frameRect = frames[idx];
          drawWidth = 145;
          drawHeight = 140;

          // Fiery aura
          ctx.strokeStyle = "#f87171";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(state.bossX, state.bossY, 65, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isPhaseTwo) {
          // Transformed Monster Form
          const frames = state.rushTime > 0 && state.rushTime < 1.25
            ? spriteMap.phase2Attack
            : spriteMap.phase2Idle;
          const idx = Math.floor(state.animTimer * 4) % frames.length;
          frameRect = frames[idx];
          drawWidth = 140;
          drawHeight = 130;
        } else {
          // Phase 1: Human Form
          const frames = state.flinchTimer > 0
            ? spriteMap.humanHit
            : state.rushTime > 0 && state.rushTime < 1.25
            ? spriteMap.humanAttack
            : Math.abs(state.bossX - (W / 2 + Math.sin(elapsed * 0.8) * 180)) > 2
            ? spriteMap.humanWalk
            : spriteMap.humanIdle;
          const idx = Math.floor(state.animTimer * 4) % frames.length;
          frameRect = frames[idx];
          drawWidth = 84;
          drawHeight = 126;
        }

        const [sx, sy, sw, sh] = frameRect;
        const aspect = sw / sh;
        const actualWidth = Math.round(drawHeight * aspect);

        // Draw soft water shadow under boss
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.beginPath();
        ctx.ellipse(state.bossX, state.bossY + drawHeight / 2 - 8, Math.min(actualWidth * 0.45, 60), 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.drawImage(
          sprite,
          sx,
          sy,
          sw,
          sh,
          state.bossX - actualWidth / 2,
          state.bossY - drawHeight / 2,
          actualWidth,
          drawHeight
        );

        // White flash when taking damage
        if (state.bossFlashTimer > 0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.beginPath();
          ctx.arc(state.bossX, state.bossY, drawWidth * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Syndicate Void Shield (active when squad is under 3 persons)
        if (state.squadCount < 3 && state.bossHp > 0) {
          ctx.save();
          ctx.strokeStyle = `rgba(192, 132, 252, ${0.75 + Math.sin(state.animTimer * 5) * 0.2})`;
          ctx.lineWidth = 4;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.arc(state.bossX, state.bossY, isPhaseTwo ? 85 : 72, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(192, 132, 252, 0.12)";
          ctx.fill();
          ctx.restore();
        }
      }

      // 3. Floating Powerups
      state.powerups.forEach((p) => {
        const pulseScale = 1 + Math.sin(p.pulse) * 0.12;
        const color = p.type === "spread" ? "#f59e0b" : p.type === "shield" ? "#3b82f6" : "#10b981";

        ctx.fillStyle = `${color}33`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * pulseScale * 1.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * pulseScale, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = "bold 13px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(p.type === "spread" ? "⭐" : p.type === "shield" ? "🛡️" : "⚡", p.x, p.y);
      });

      // 4. Boss Hazards Rendering (radius === 11)
      state.hazards.forEach((hazard) => {
        ctx.fillStyle = opponents[opponent].accent;
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(hazard.x - 3, hazard.y - 3, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // 5. Player Shots Rendering (radius === 5)
      state.shots.forEach((shot) => {
        ctx.fillStyle = state.activePowerup?.type === "spread" ? "#38bdf8" : "#ffdf73";
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // 6. Player and Squad Companions Rendering
      const avatarImg = images.current.avatar;

      // Render Squad Companions
      state.companions.forEach((comp) => {
        const compX = state.x + comp.offsetX;
        const compY = state.y + comp.offsetY;
        // Shadow under companion
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.beginPath();
        ctx.ellipse(compX, compY + 24, 18, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        if (avatarImg?.complete && avatarImg.naturalWidth) {
          const [sx, sy] = portraits[comp.avatarId] || portraits.fern;
          ctx.drawImage(avatarImg, sx, sy, 275, 415, compX - 24, compY - 45, 48, 72);
        }

        // Companion name tag
        ctx.font = "800 10px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = comp.accent;
        ctx.fillText(comp.name, compX, compY + 36);
      });

      // Player Swimmer Rendering
      if (state.invulnerable <= 0 || Math.floor(state.invulnerable * 8) % 2 === 0) {
        // Shadow under swimmer
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.beginPath();
        ctx.ellipse(state.x, state.y + 26, 22, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        if (avatarImg?.complete && avatarImg.naturalWidth) {
          const [sx, sy] = portraits[game.me.avatarId] || portraits.fern;
          ctx.drawImage(avatarImg, sx, sy, 275, 415, state.x - 27, state.y - 50, 54, 80);
        }

        // Active Bubble Shield Forcefield
        if (state.activePowerup?.type === "shield") {
          ctx.strokeStyle = `rgba(96, 165, 250, ${0.7 + Math.sin(state.animTimer * 10) * 0.25})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(state.x, state.y - 10, 36, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
          ctx.beginPath();
          ctx.arc(state.x, state.y - 10, 36, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 7. Particles
      state.particles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // 8. Floating Combat Texts
      state.floatingTexts.forEach((ft) => {
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.font = `800 ${ft.size}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#000000";
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      });
      ctx.globalAlpha = 1;

      // 9. Non-intrusive Top Alert Ribbon (does not cover boss or player graphics)
      if (state.banner) {
        const progress = state.banner.timer / state.banner.maxTimer;
        const bannerAlpha = Math.min(1, progress * 3);
        ctx.save();
        ctx.globalAlpha = bannerAlpha;

        ctx.fillStyle = "rgba(10, 25, 35, 0.88)";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 180, 16, 360, 28, 14);
        ctx.fill();

        ctx.strokeStyle = state.banner.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = "800 12px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = state.banner.color;
        ctx.fillText(state.banner.text, W / 2, 30);
        ctx.restore();
      }

      ctx.restore();

      // Update React HUD periodically without excessive renders
      if (now - displayAt > 100) {
        displayAt = now;
        setHud({
          hp: state.hp,
          stage: state.stage,
          squadCount: state.squadCount,
        });
        setDashReady(state.dashCooldown <= 0);
        setActivePowerupUi(state.activePowerup ? `${state.activePowerup.type} (${Math.ceil(state.activePowerup.timer)}s)` : null);
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [phase, game.me.avatarId, finish, opponent]);

  function start() {
    const freshBattle = fresh(squadCount);
    freshBattle.phase = "playing";
    battle.current = freshBattle;
    setResults(null);
    setHud({ hp: 100, stage: "human", squadCount });
    setPhase("playing");
    if (squadCount >= 3) {
      freshBattle.banner = {
        text: "3-MAN SQUAD LINKED",
        subtext: "Boss Void Shield shattered! Combined firepower active!",
        color: "#38bdf8",
        timer: 2.2,
        maxTimer: 2.2,
      };
    } else {
      freshBattle.banner = {
        text: "INSUFFICIENT CREW",
        subtext: "Boss Void Shield active! 3 swimmers required to pierce!",
        color: "#f87171",
        timer: 2.5,
        maxTimer: 2.5,
      };
    }
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    void orientation?.lock?.("landscape").catch(() => {});
  }

  function moveJoystick(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointer.current !== event.pointerId || !joystick.current) return;
    const box = joystick.current.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    const rotated = window.innerHeight > window.innerWidth;
    const localX = rotated ? y : x;
    const localY = rotated ? -x : y;
    const radius = Math.min(box.width, box.height) * 0.36;
    const length = Math.hypot(localX, localY);
    const scale = length > radius ? radius / length : 1;
    controls.current.x = (localX * scale) / radius;
    controls.current.y = (localY * scale) / radius;
    setKnob({ x: localX * scale, y: localY * scale });
  }

  function releaseJoystick(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    controls.current.x = 0;
    controls.current.y = 0;
    setKnob({ x: 0, y: 0 });
  }

  return (
    <section
      className="boss-screen"
      aria-label={`${opponents[opponent].name} boss encounter`}
      data-boss-phase={hud.stage}
    >
      <div className="boss-landscape">
        {/* Top HUD: ONLY Player Health & Squad Counter are visible. Boss health is hidden. */}
        <div className="boss-hud">
          <Link href="/" className="boss-back" aria-label="Leave boss fight">
            ← <span>Island</span>
          </Link>
          <div className="boss-health">
            <span>You</span>
            <div>
              <i style={{ width: `${hud.hp}%` }} />
            </div>
            <b>{hud.hp}</b>
          </div>
          <div
            className="boss-timer boss-squad-badge"
            aria-label={`Raid squad: ${hud.squadCount} swimmers active`}
          >
            <Users size={14} />
            <span>{hud.squadCount} SWIMMERS</span>
          </div>
          <div className="boss-name" style={{ color: opponents[opponent].accent }}>
            {opponents[opponent].name}
            <small>
              {hud.stage === "defeated"
                ? "Defeated"
                : hud.stage === "enraged"
                ? "Enraged"
                : hud.stage === "transformed"
                ? "Transformed"
                : "Encounter"}
            </small>
          </div>
          <div className="boss-hud-actions">
            {activePowerupUi && (
              <span
                className={`boss-powerup-badge ${
                  activePowerupUi.startsWith("spread")
                    ? "spread"
                    : activePowerupUi.startsWith("shield")
                    ? "shield"
                    : "speed"
                }`}
              >
                {activePowerupUi.startsWith("spread") ? (
                  <Zap size={12} />
                ) : activePowerupUi.startsWith("shield") ? (
                  <Shield size={12} />
                ) : (
                  <Sparkles size={12} />
                )}
                {activePowerupUi}
              </span>
            )}
            <button
              className="boss-sound-btn"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Mute arcade audio" : "Enable arcade audio"}
              title={soundEnabled ? "Mute audio" : "Enable audio"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          </div>
        </div>

        {/* 16:9 Landscape Arena Playfield */}
        <div className="boss-playfield">
          <canvas
            ref={canvas}
            width={W}
            height={H}
            aria-label="Boss arena. Move with the joystick or arrow keys and hold attack to fire."
          />

          {phase !== "playing" && (
            <div className="boss-intro">
              <div className="boss-intro-card">
                <span className="boss-kicker">3-PERSON RAID SQUAD · NO TIMER</span>
                <h1>
                  {phase === "won"
                    ? `You defeated ${opponents[opponent].name}!`
                    : phase === "lost"
                    ? "The encounter ended"
                    : `Face ${opponents[opponent].name}`}
                </h1>
                <p>
                  {phase === "won"
                    ? `Your ${hud.squadCount}-man squad destroyed the boss and cleared the waters.`
                    : phase === "lost"
                    ? `The boss overpowered your squad. Assemble at least 3 persons to break through.`
                    : `Defeat ${opponents[opponent].name}. Boss void armor deflects solo attacks and requires at least 3 swimmers to pierce!`}
                </p>

                {phase === "ready" && (
                  <div className="boss-squad-config">
                    <div className="boss-squad-selector">
                      <button
                        type="button"
                        className={`boss-squad-btn ${squadCount === 1 ? "active" : ""}`}
                        onClick={() => setSquadCount(1)}
                      >
                        1 Solo
                      </button>
                      <button
                        type="button"
                        className={`boss-squad-btn ${squadCount === 2 ? "active" : ""}`}
                        onClick={() => setSquadCount(2)}
                      >
                        2 Duo
                      </button>
                      <button
                        type="button"
                        className={`boss-squad-btn ${squadCount === 3 ? "active" : ""}`}
                        onClick={() => setSquadCount(3)}
                      >
                        3 Squad (Required)
                      </button>
                    </div>

                    <div className="boss-squad-preview">
                      <span className="boss-squad-member-chip">
                        🏊 <b>You</b> (Lead)
                      </span>
                      {squadCount >= 2 && (
                        <span className="boss-squad-member-chip">
                          🌊 <b>Kai</b> (Vanguard)
                        </span>
                      )}
                      {squadCount >= 3 && (
                        <span className="boss-squad-member-chip">
                          ⚡ <b>Maya</b> (Gunner)
                        </span>
                      )}
                    </div>

                    {squadCount < 3 ? (
                      <div className="boss-squad-warning">
                        ⚠️ Void Shield Active: Deflects 93% damage unless attacked by at least 3 persons!
                      </div>
                    ) : (
                      <div className="boss-squad-success">
                        ✓ 3-swimmer formation ready: Boss Void Shield will be shattered!
                      </div>
                    )}
                  </div>
                )}

                {results && (
                  <div className="boss-results" aria-label="Encounter summary">
                    <div>
                      <strong>{results.squadCount}</strong>
                      <span>Swimmers in squad</span>
                    </div>
                    <div>
                      <strong>
                        {results.shotsLanded}/{results.shotsFired}
                      </strong>
                      <span>Shots landed</span>
                    </div>
                    <div>
                      <strong>{results.hitsTaken}</strong>
                      <span>Hits taken</span>
                    </div>
                  </div>
                )}

                <p className="boss-small">This raid encounter requires at least 3 persons to pierce the boss's void barrier.</p>

                {loadError ? (
                  <p className="boss-error">
                    The sprite sheets could not load. Reconnect and reload this page.
                  </p>
                ) : (
                  <button className="boss-start" onClick={start} disabled={!loaded}>
                    {!loaded ? "Loading sprites…" : phase === "ready" ? (squadCount >= 3 ? "Start 3-Person Raid" : "Start Battle") : "Try again"}
                  </button>
                )}

                <Link href="/" className="boss-exit">
                  Back to island
                </Link>
              </div>
            </div>
          )}

          {phase === "playing" && (
            <div className="boss-controls">
              <button
                ref={joystick}
                className="boss-joystick"
                aria-label="Movement joystick. Keyboard: arrow keys or WASD"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pointer.current = event.pointerId;
                  moveJoystick(event);
                }}
                onPointerMove={moveJoystick}
                onPointerUp={releaseJoystick}
                onPointerCancel={releaseJoystick}
                onLostPointerCapture={releaseJoystick}
              >
                <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
              </button>

              <div className="boss-actions-cluster">
                <button
                  className="boss-dash"
                  aria-label="Dodge dash (Keyboard: Shift or K)"
                  disabled={!dashReady}
                  onClick={triggerDash}
                >
                  DASH
                </button>

                <button
                  className="boss-attack"
                  aria-label="Hold to attack"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    controls.current.attack = true;
                  }}
                  onPointerUp={() => {
                    controls.current.attack = false;
                  }}
                  onPointerCancel={() => {
                    controls.current.attack = false;
                  }}
                  onLostPointerCapture={() => {
                    controls.current.attack = false;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") controls.current.attack = true;
                  }}
                  onKeyUp={() => {
                    controls.current.attack = false;
                  }}
                >
                  ATTACK
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="boss-rotate-hint">
          Rotate your phone for a wider view · Keyboard: WASD to move, Space to shoot, Shift to dash
        </p>
      </div>
    </section>
  );
}
