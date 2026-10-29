"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useGame } from "../game-provider";
import type { AvatarId } from "../../lib/avatars";
import {
  bossStage,
  bossHealthFloor,
  TARGET_RAID_DURATION_SECONDS,
  getScaledBossHp,
  type BossStage,
} from "./boss-rules";
import { contraAudio } from "../../lib/contra-audio";
import { lobbyRequest, type BossLobby } from "./lobby";
import { PlayerAvatar } from "../avatar";
import {
  Volume2,
  VolumeX,
  Shield,
  Zap,
  Sparkles,
  Users,
  Heart,
  Timer,
  Swords,
} from "lucide-react";

const W = 960;
const H = 540;
type Phase = "ready" | "playing" | "won" | "lost";
type Opponent = "kirkify" | "diddy" | "epstein";

const opponents: Record<
  Opponent,
  {
    name: string;
    image: string;
    accent: string;
    title: string;
    day: number;
    targetMinutes: number;
    description: string;
  }
> = {
  kirkify: {
    name: "Kirkify",
    image: "/images/Kirk%20Sprite%20Sheet.png",
    accent: "#f9d779",
    title: "Coastal Enforcer",
    day: 10,
    targetMinutes: 5,
    description: "Coastal enforcer commanding ricochet coconut clusters, sweeping void claws, and demonic phase transformations.",
  },
  diddy: {
    name: "Diddy",
    image: "/images/Diddy%20Sprite%20Sheet.png",
    accent: "#fca47c",
    title: "Island Horror Overseer",
    day: 20,
    targetMinutes: 10,
    description: "Horrific conch overseer firing tracking laser beams, razor whirlpools, and corrupted island projectiles.",
  },
  epstein: {
    name: "Epstein",
    image: "/images/Epstein%20Sprite%20Sheet.png",
    accent: "#23ced9",
    title: "Island Overlord",
    day: 30,
    targetMinutes: 15,
    description: "Ultimate eldritch overlord unleashing tentacle eruptions, mouth death beams, and apocalyptic blood-moon barrage.",
  },
};

type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color?: string;
};

type Shot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color?: string;
  damage?: number;
};

type WarningZone = {
  x: number;
  y: number;
  radius: number;
  time: number;
  maxTime: number;
  type: "rush" | "pillar" | "tentacle";
};

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

type PowerupType = "spread" | "shield" | "speed" | "heal";
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
  hp: number;
  maxHp: number;
  bossHp: number;
  maxBossHp: number;
  battleTimer: number;
  shieldHits: number;
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

function fresh(squadCount: number = 1, opp: Opponent = "kirkify"): Battle {

  const scaledHp = getScaledBossHp(opp, squadCount);

  return {
    squadCount,
    hp: 100,
    maxHp: 100,
    bossHp: scaledHp,
    maxBossHp: scaledHp,
    battleTimer: 0,
    shieldHits: 0,
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
    spawn: 1.1,
    rushClock: 8.5,
    rushTime: 0,
    rushX: 0,
    rushY: 0,
    laserClock: 9.5,
    powerupSpawnTimer: 8,
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

// Some supplied frames include a dark matte. Remove only dark pixels connected
// to the frame edge, preserving dark details enclosed inside the character.
const cleanedFrames = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();
function cleanBossFrame(image: HTMLImageElement, frame: Frame): HTMLCanvasElement {
  let frames = cleanedFrames.get(image);
  if (!frames) { frames = new Map(); cleanedFrames.set(image, frames); }
  const key = frame.join(",");
  const existing = frames.get(key);
  if (existing) return existing;
  const [x, y, width, height] = frame;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  function enqueue(index: number) {
    if (visited[index]) return;
    visited[index] = 1;
    const p = index * 4;
    if (pixels.data[p + 3] === 0 || (pixels.data[p] < 55 && pixels.data[p + 1] < 55 && pixels.data[p + 2] < 70)) queue[tail++] = index;
  }
  for (let column = 0; column < width; column++) { enqueue(column); enqueue((height - 1) * width + column); }
  for (let row = 0; row < height; row++) { enqueue(row * width); enqueue(row * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], column = index % width, row = Math.floor(index / width);
    pixels.data[index * 4 + 3] = 0;
    if (column > 0) enqueue(index - 1);
    if (column + 1 < width) enqueue(index + 1);
    if (row > 0) enqueue(index - width);
    if (row + 1 < height) enqueue(index + width);
  }
  ctx.putImageData(pixels, 0, 0);
  frames.set(key, canvas);
  return canvas;
}

function DialoguePortrait({ opponent }: { opponent: Opponent }) {
  const target = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = target.current?.getContext("2d");
    if (!ctx) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const cleaned = cleanBossFrame(image, SPRITE_MAPS[opponent].humanIdle[0]);
      const scale = Math.min(110 / cleaned.width, 120 / cleaned.height);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 120, 130);
      ctx.drawImage(cleaned, (120 - cleaned.width * scale) / 2, 130 - cleaned.height * scale, cleaned.width * scale, cleaned.height * scale);
    };
    image.src = opponents[opponent].image;
    return () => { cancelled = true; };
  }, [opponent]);
  return <canvas ref={target} width={120} height={130} aria-hidden="true" />;
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
      [16, 726, 274, 114],
      [290, 715, 220, 120],
      [510, 715, 205, 116],
      [717, 722, 212, 111],
    ],
    phase2Attack: [
      [16, 726, 274, 114],
      [290, 715, 220, 120],
      [510, 715, 205, 116],
    ],
    phase2Enraged: [
      [12, 855, 143, 137],
      [155, 855, 145, 138],
      [300, 855, 115, 138],
      [415, 855, 185, 140],
    ],
    defeated: [
      [600, 868, 145, 125],
      [750, 868, 180, 120],
      [930, 868, 220, 125],
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
  const images = useRef<{ boss?: HTMLImageElement; avatar?: HTMLImageElement; island?: HTMLImageElement }>({});
  const battle = useRef<Battle>(fresh(1, initialOpponent));
  const controls = useRef({ x: 0, y: 0, aimX: 0, aimY: -1, attack: false, keys: new Set<string>() });
  const aimJoystick = useRef<HTMLButtonElement>(null);
  const aimPointer = useRef<number | null>(null);
  const lobbyRef = useRef<BossLobby | null>(null);
  const raidDamage = useRef(0);
  const syncing = useRef(false);
  const [lobby, setLobby] = useState<BossLobby | null>(null);
  const [lobbyError, setLobbyError] = useState("");
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [aimKnob, setAimKnob] = useState({ x: 0, y: 0 });
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [phase, setPhase] = useState<Phase>("ready");
  const [opponent, setOpponent] = useState<Opponent>(initialOpponent);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [dashReady, setDashReady] = useState(true);
  const [activePowerupUi, setActivePowerupUi] = useState<string | null>(null);
  const [battleTimeStr, setBattleTimeStr] = useState("00:00");
  const [hud, setHud] = useState<{ hp: number; stage: BossStage; squadCount: number }>({
    hp: 100,
    stage: "human",
    squadCount: 1,
  });
  const [results, setResults] = useState<{
    squadCount: number;
    shotsLanded: number;
    shotsFired: number;
    hitsTaken: number;
    durationStr: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    contraAudio.setEnabled(next);
  };

  // Sprite Sheets Loader with crisp alpha rendering
  useEffect(() => {
    let cancelled = false;

    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          resolve(img);
        };
        img.onerror = () => {
          reject(new Error(`Failed to load ${src}`));
        };
        img.src = src;
        if (img.complete && img.naturalWidth > 0) {
          resolve(img);
        }
      });
    };

    Promise.all([
      loadImage(opponents[opponent].image),
      loadImage("/images/Pixel-Art%20Base%20Avatar%20Selection%20Sheet.png"),
      loadImage("/images/island-board-v2.png"),
    ])
      .then(([boss, avatar, island]) => {
        if (cancelled) return;
        images.current = { boss, avatar, island };
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [opponent]);

  const finish = useCallback((result: "won" | "lost") => {
    battle.current.phase = result;
    controls.current.attack = false;
    const effectiveCeiling = battle.current.maxBossHp;
    const finalStage = bossStage(battle.current.bossHp, effectiveCeiling);
    battle.current.stage = finalStage;

    if (result === "won") {
      contraAudio.playVictory();
    } else {
      contraAudio.playExplosion();
    }

    const m = Math.floor(battle.current.battleTimer / 60);
    const s = Math.floor(battle.current.battleTimer % 60);
    const durationStr = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    setResults({
      squadCount: battle.current.squadCount,
      shotsLanded: battle.current.shotsLanded,
      shotsFired: battle.current.shotsFired,
      hitsTaken: battle.current.hitsTaken,
      durationStr,
    });
    setHud({
      hp: battle.current.hp,
      stage: finalStage,
      squadCount: battle.current.squadCount,
    });
    setPhase(result);
  }, []);

  function rememberLobby(value: BossLobby | null) {
    lobbyRef.current = value;
    setLobby(value);
  }

  async function enterLobby() {
    if (!game.room.id || lobbyBusy) return;
    setLobbyBusy(true);
    setLobbyError("");
    try {
      const value = await lobbyRequest(game.room.id, "join", { opponent });
      rememberLobby(value);
      raidDamage.current = value?.players.find(player => player.self)?.damageTotal ?? 0;
    } catch (error) { setLobbyError(error instanceof Error ? error.message : "Could not join the lobby."); }
    finally { setLobbyBusy(false); }
  }

  async function leaveLobby() {
    setLobbyBusy(true);
    try { await lobbyRequest(game.room.id, "leave"); rememberLobby(null); }
    catch (error) { setLobbyError(error instanceof Error ? error.message : "Could not leave the lobby."); }
    finally { setLobbyBusy(false); }
  }

  const hasLobby = lobby !== null;
  useEffect(() => {
    if (!hasLobby || !game.room.id) return;
    let cancelled = false;
    const update = async () => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        const state = battle.current;
        const next = await lobbyRequest(game.room.id, "heartbeat", { x: state.x, y: state.y, bossX: state.bossX, bossY: state.bossY, alive: phase !== "lost", damageTotal: raidDamage.current });
        if (cancelled || !next) return;
        rememberLobby(next);
        setLobbyError("");
        if (next.phase === "playing" && phase === "ready") {
          const freshBattle = fresh(next.players.length, next.opponent);
          freshBattle.phase = "playing";
          freshBattle.hp = 100;
          freshBattle.bossHp = next.hp;
          freshBattle.maxBossHp = next.maxHp;
          freshBattle.battleTimer = next.startedAt ? Math.max(0, (Date.now() - Date.parse(next.startedAt)) / 1000) : 0;
          battle.current = freshBattle;
          setOpponent(next.opponent);
          setResults(null);
          setDialogueOpen(true);
          setPhase("playing");
        } else if (next.phase === "playing" && phase === "playing") {
          state.bossHp = next.hp;
          state.maxBossHp = next.maxHp;
        } else if (next.phase === "won" && phase === "playing") {
          state.bossHp = 0;
          finish("won");
        }
      } catch { if (!cancelled) setLobbyError("Connection lost. Reconnecting to your crew…"); }
      finally { syncing.current = false; }
    };
    void update();
    const timer = window.setInterval(update, 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [hasLobby, game.room.id, phase, finish]);

  useEffect(() => () => { screen.orientation?.unlock?.(); }, []);

  const triggerDash = useCallback(() => {
    const state = battle.current;
    if (state.phase !== "playing" || state.dashCooldown > 0) return;
    const speedBoost = state.activePowerup?.type === "speed";
    state.dashCooldown = speedBoost ? 0.75 : 1.5;
    state.dashTimer = 0.32;
    state.invulnerable = Math.max(state.invulnerable, 0.45);

    const held = controls.current.keys;
    const dx = controls.current.x + Number(held.has("arrowright") || held.has("d")) - Number(held.has("arrowleft") || held.has("a"));
    const dy = controls.current.y + Number(held.has("arrowdown") || held.has("s")) - Number(held.has("arrowup") || held.has("w"));
    const mag = Math.hypot(dx, dy);

    if (mag > 0.1) {
      state.dashVx = (dx / mag) * 620;
      state.dashVy = (dy / mag) * 620;
    } else {
      state.dashVx = 0;
      state.dashVy = -620;
    }

    contraAudio.playDash();

    // Spawn splash burst
    for (let i = 0; i < 14; i++) {
      state.particles.push({
        x: state.x + (Math.random() - 0.5) * 24,
        y: state.y + (Math.random() - 0.5) * 24,
        vx: (Math.random() - 0.5) * 180 - state.dashVx * 0.15,
        vy: (Math.random() - 0.5) * 180 - state.dashVy * 0.15,
        life: 0.38,
        maxLife: 0.38,
        color: "#93c5fd",
        size: 3 + Math.random() * 4,
      });
    }

    state.floatingTexts.push({
      id: Math.random(),
      text: "DODGE!",
      x: state.x,
      y: state.y - 30,
      vy: -55,
      alpha: 1,
      color: "#67e8f9",
      size: 13,
    });
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (phase !== "playing" || dialogueOpen) return;
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " "].includes(key)) {
        event.preventDefault();
      }
      if (key === "shift") {
        event.preventDefault();
        triggerDash();
      }
      controls.current.keys.add(key);
      const aimX = Number(controls.current.keys.has("l")) - Number(controls.current.keys.has("j"));
      const aimY = Number(controls.current.keys.has("k")) - Number(controls.current.keys.has("i"));
      const length = Math.hypot(aimX, aimY);
      if (length) { controls.current.aimX = aimX / length; controls.current.aimY = aimY / length; }
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
  }, [triggerDash, phase, dialogueOpen]);

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
      if (document.hidden || dialogueOpen) {
        last = now;
        frame = requestAnimationFrame(render);
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;

      state.animTimer += dt;
      state.battleTimer += dt;
      if (state.flinchTimer > 0) state.flinchTimer -= dt;
      if (state.bossFlashTimer > 0) state.bossFlashTimer -= dt;
      if (state.screenShake > 0) state.screenShake -= dt;
      if (state.invulnerable > 0) state.invulnerable -= dt;

      // Passive gentle health recovery if player hasn't taken hits recently (sustains long 5-15 min raids)
      if (state.hp < state.maxHp && state.hitsTaken > 0 && state.flinchTimer <= 0) {
        state.hp = Math.min(state.maxHp, state.hp + dt * 0.4);
      }

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

      // Current stage evaluation: support both scaled raid HP and test harness fixture
      const effectiveCeiling = state.maxBossHp;
      const currentStage = bossStage(state.bossHp, effectiveCeiling);

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
          finish("won");
          return;
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
        const speedMultiplier = state.activePowerup?.type === "speed" ? 1.45 : 1.0;
        state.x = Math.max(35, Math.min(W - 35, state.x + dx * 250 * speedMultiplier * dt));
        state.y = Math.max(100, Math.min(H - 38, state.y + dy * 250 * speedMultiplier * dt));
      }

      // Boss Movement Dynamics (Tactical strafing across upper lagoon)
      const elapsed = state.animTimer;
      const isPhaseTwo = state.stage === "transformed" || state.stage === "enraged";
      const isEnraged = state.stage === "enraged";
      const strafeSpeed = isEnraged ? 1.4 : isPhaseTwo ? 1.1 : 0.85;
      const targetBossX = W / 2 + Math.sin(elapsed * strafeSpeed) * (W * 0.32);
      const targetBossY = 130 + Math.sin(elapsed * 2.2) * 22;

      // The host drives the shared boss position; guests follow its updates.
      const remoteBoss = lobbyRef.current && !lobbyRef.current.host ? lobbyRef.current : null;
      if (remoteBoss) {
        state.bossX += (remoteBoss.bossX - state.bossX) * Math.min(1, dt * 5);
        state.bossY += (remoteBoss.bossY - state.bossY) * Math.min(1, dt * 5);
        state.rushTime = 0;
      } else {
      // Rush Attack Management
      state.rushClock -= dt;
      if (state.rushClock <= 0 && state.rushTime <= 0) {
        state.rushTime = 2.2;
        state.rushClock = isEnraged ? 6.5 : 9.0;
        state.rushX = state.x;
        state.rushY = state.y;
      }

      if (state.rushTime > 0) {
        state.rushTime -= dt;
        if (state.rushTime > 1.25) {
          // Telegraphing: Tracking player coordinate
          state.rushX = state.x;
          state.rushY = state.y;
        } else {
          // High-speed Rush Strike
          state.bossX = state.bossX + (state.rushX - state.bossX) * (dt * 6.5);
          state.bossY = state.bossY + (state.rushY - state.bossY) * (dt * 6.5);

          // Rush Collision with Player
          const distToPlayer = Math.hypot(state.bossX - state.x, state.bossY - state.y);
          if (distToPlayer < 48 && state.invulnerable <= 0) {
            state.invulnerable = 1.0;
            state.hitsTaken += 1;
            contraAudio.playPlayerHit();
            state.screenShake = 0.35;
            state.screenShakeIntensity = 7;

            if (state.activePowerup?.type === "shield" && state.shieldHits > 0) {
              state.shieldHits -= 1;
              state.floatingTexts.push({
                id: Math.random(),
                text: "SHIELD BLOCKED!",
                x: state.x,
                y: state.y - 25,
                vy: -40,
                alpha: 1,
                color: "#60a5fa",
                size: 13,
              });
              if (state.shieldHits <= 0) state.activePowerup = null;
            } else {
              state.hp = Math.max(0, state.hp - (isEnraged ? 28 : 20));
              state.floatingTexts.push({
                id: Math.random(),
                text: isEnraged ? "-28 HP" : "-20 HP",
                x: state.x,
                y: state.y - 25,
                vy: -40,
                alpha: 1,
                color: "#f87171",
                size: 14,
              });
              if (state.hp <= 0) {
                finish("lost");
                return;
              }
            }
          }
        }
      } else {
        state.bossX += (targetBossX - state.bossX) * (dt * 2.8);
        state.bossY += (targetBossY - state.bossY) * (dt * 2.8);
      }
      }

      // Laser Beam Telegraph & Fire
      state.laserClock -= dt;
      if (state.laserClock <= 0 && !state.laser) {
        state.laser = {
          x: state.bossX,
          y: state.bossY,
          targetX: state.x,
          targetY: state.y,
          chargeTimer: 1.4,
          fireTimer: 0.55,
        };
        state.laserClock = isEnraged ? 7.0 : 10.0;
      }

      if (state.laser) {
        if (state.laser.chargeTimer > 0) {
          state.laser.chargeTimer -= dt;
          state.laser.x = state.bossX;
          state.laser.y = state.bossY;
          state.laser.targetX = state.x;
          state.laser.targetY = state.y;
        } else if (state.laser.fireTimer > 0) {
          state.laser.fireTimer -= dt;
          // Check collision with beam
          const dist = Math.hypot(state.laser.targetX - state.laser.x, state.laser.targetY - state.laser.y);
          const nx = (state.laser.targetX - state.laser.x) / (dist || 1);
          const ny = (state.laser.targetY - state.laser.y) / (dist || 1);
          const px = state.x - state.laser.x;
          const py = state.y - state.laser.y;
          const dot = px * nx + py * ny;
          const projX = state.laser.x + nx * dot;
          const projY = state.laser.y + ny * dot;
          const perpDist = Math.hypot(state.x - projX, state.y - projY);

          if (dot > 0 && dot < dist + 40 && perpDist < 26 && state.invulnerable <= 0) {
            state.invulnerable = 0.9;
            state.hitsTaken += 1;
            contraAudio.playPlayerHit();
            state.screenShake = 0.3;
            state.screenShakeIntensity = 6;
            state.hp = Math.max(0, state.hp - 22);
            state.floatingTexts.push({
              id: Math.random(),
              text: "BEAM HIT -22",
              x: state.x,
              y: state.y - 25,
              vy: -40,
              alpha: 1,
              color: "#f87171",
              size: 13,
            });
            if (state.hp <= 0) {
              finish("lost");
              return;
            }
          }
        } else {
          state.laser = null;
        }
      }

      // Player Firing
      const attacking = controls.current.attack || held.has(" ");
      state.cooldown -= dt;
      if (attacking && state.cooldown <= 0) {
        state.cooldown = state.activePowerup?.type === "spread" ? 0.15 : 0.18;
        state.shotsFired += 1;
        contraAudio.playShoot();

        const angle = Math.atan2(controls.current.aimY, controls.current.aimX);
        const offsets = state.activePowerup?.type === "spread" ? [-0.2, 0, 0.2] : [0];
        for (const offset of offsets) {
          const dx = Math.cos(angle + offset), dy = Math.sin(angle + offset);
          state.shots.push({ x: state.x + dx * 30, y: state.y + dy * 30, vx: dx * 600, vy: dy * 600, color: offsets.length > 1 ? "#23ced9" : "#ffdf73", damage: offsets.length > 1 ? 10 : 12 });
        }
      }

      // Boss Hazard Spawning (Cluster attacks, spiral bursts, wave fans)
      state.spawn -= dt;
      if (state.spawn <= 0) {
        state.spawn = isEnraged ? 0.75 : isPhaseTwo ? 1.0 : 1.25;
        const pattern = Math.floor(Math.random() * 3);

        if (pattern === 0) {
          // Circular / Fan Wave
          const count = isEnraged ? 7 : isPhaseTwo ? 5 : 3;
          const arc = Math.PI * 0.65;
          const baseAngle = Math.PI / 2;
          for (let i = 0; i < count; i++) {
            const angle = baseAngle - arc / 2 + (arc / (count - 1 || 1)) * i;
            state.hazards.push({
              x: state.bossX,
              y: state.bossY + 25,
              vx: Math.cos(angle) * 230,
              vy: Math.sin(angle) * 230,
              radius: 11,
              color: opponents[opponent].accent,
            });
          }
        } else if (pattern === 1) {
          // Targeted Aimed Burst
          const aimDx = state.x - state.bossX;
          const aimDy = state.y - state.bossY;
          for (let offset = -0.18; offset <= 0.18; offset += 0.18) {
            const angle = Math.atan2(aimDy, aimDx) + offset;
            state.hazards.push({
              x: state.bossX,
              y: state.bossY + 25,
              vx: Math.cos(angle) * 260,
              vy: Math.sin(angle) * 260,
              radius: 11,
              color: "#f87171",
            });
          }
        } else {
          // Spiral Barrage
          state.spiralAngle += 0.45;
          state.hazards.push({
            x: state.bossX,
            y: state.bossY + 25,
            vx: Math.sin(state.spiralAngle) * 240,
            vy: Math.cos(state.spiralAngle) * 240,
            radius: 11,
            color: "#fbbf24",
          });
        }
      }

      // Power-up Spawning (Health Medkits, Spread, Shield, Speed)
      state.powerupSpawnTimer -= dt;
      if (state.powerupSpawnTimer <= 0) {
        state.powerupSpawnTimer = 11 + Math.random() * 6;
        const types: PowerupType[] = ["heal", "spread", "shield", "speed"];
        const chosen = types[Math.floor(Math.random() * types.length)];
        state.powerups.push({
          id: Math.random(),
          x: 60 + Math.random() * (W - 120),
          y: 200 + Math.random() * (H - 260),
          type: chosen,
          radius: 18,
          pulse: 0,
        });
      }

      // Update Powerups & Player Pickup
      state.powerups.forEach((p) => {
        p.pulse += dt * 3.5;
        const dist = Math.hypot(state.x - p.x, state.y - p.y);
        if (dist < 38) {
          contraAudio.playPowerup();
          if (p.type === "heal") {
            state.hp = Math.min(state.maxHp, state.hp + 30);
            state.floatingTexts.push({
              id: Math.random(),
              text: "+30 HP",
              x: state.x,
              y: state.y - 30,
              vy: -45,
              alpha: 1,
              color: "#34d399",
              size: 14,
            });
          } else {
            state.activePowerup = { type: p.type, timer: 12 };
            if (p.type === "shield") state.shieldHits = 3;
            state.floatingTexts.push({
              id: Math.random(),
              text: p.type.toUpperCase() + " ACTIVE!",
              x: state.x,
              y: state.y - 30,
              vy: -45,
              alpha: 1,
              color: p.type === "spread" ? "#f59e0b" : p.type === "shield" ? "#60a5fa" : "#10b981",
              size: 13,
            });
          }
        }
      });
      state.powerups = state.powerups.filter((p) => Math.hypot(state.x - p.x, state.y - p.y) >= 38);

      // Update Shots & Collisions with Boss
      state.shots.forEach((s) => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        // Collision with Boss
        const distToBoss = Math.hypot(s.x - state.bossX, s.y - state.bossY);
        if (distToBoss < 58 && state.bossHp > 0) {
          state.shotsLanded += 1;
          state.bossFlashTimer = 0.08;
          contraAudio.playBossHit();

          const dmg = s.damage || 10;
          if (lobbyRef.current) raidDamage.current += dmg;
          else state.bossHp = Math.max(bossHealthFloor(state.maxBossHp, state.battleTimer, TARGET_RAID_DURATION_SECONDS[opponent]), state.bossHp - dmg);

          // Impact spark particle
          for (let i = 0; i < 4; i++) {
            state.particles.push({
              x: s.x,
              y: s.y,
              vx: (Math.random() - 0.5) * 120,
              vy: (Math.random() - 0.5) * 120,
              life: 0.22,
              maxLife: 0.22,
              color: s.color || "#fde047",
              size: 2 + Math.random() * 2,
            });
          }
        }
      });
      state.shots = state.shots.filter(
        (s) => s.y > 0 && s.y < H && s.x > 0 && s.x < W && Math.hypot(s.x - state.bossX, s.y - state.bossY) >= 58
      );

      // Update Hazards & Collisions with Player
      state.hazards.forEach((h) => {
        h.x += h.vx * dt;
        h.y += h.vy * dt;

        const distToPlayer = Math.hypot(h.x - state.x, h.y - state.y);
        if (distToPlayer < 24 && state.invulnerable <= 0) {
          state.invulnerable = 0.85;
          state.hitsTaken += 1;
          contraAudio.playPlayerHit();
          state.screenShake = 0.25;
          state.screenShakeIntensity = 5;

          if (state.activePowerup?.type === "shield" && state.shieldHits > 0) {
            state.shieldHits -= 1;
            state.floatingTexts.push({
              id: Math.random(),
              text: "ABSORBED!",
              x: state.x,
              y: state.y - 25,
              vy: -40,
              alpha: 1,
              color: "#60a5fa",
              size: 12,
            });
            if (state.shieldHits <= 0) state.activePowerup = null;
          } else {
            state.hp = Math.max(0, state.hp - 12);
            state.floatingTexts.push({
              id: Math.random(),
              text: "-12",
              x: state.x,
              y: state.y - 25,
              vy: -40,
              alpha: 1,
              color: "#f87171",
              size: 13,
            });
            if (state.hp <= 0) {
              finish("lost");
              return;
            }
          }
        }
      });
      state.hazards = state.hazards.filter(
        (h) => h.y > -20 && h.y < H + 20 && h.x > -20 && h.x < W + 20 && Math.hypot(h.x - state.x, h.y - state.y) >= 24
      );

      // Update Particles & Floating Texts
      state.particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      });
      state.particles = state.particles.filter((p) => p.life > 0);

      state.floatingTexts.forEach((ft) => {
        ft.y += ft.vy * dt;
        ft.alpha -= dt * 1.4;
      });
      state.floatingTexts = state.floatingTexts.filter((ft) => ft.alpha > 0);

      // =====================================================================
      // Canvas Rendering Pipeline (Crisp, High-Quality Cutout Graphics)
      // =====================================================================
      ctx.save();
      ctx.imageSmoothingEnabled = false;

      // Screen Shake
      if (state.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * state.screenShakeIntensity;
        const shakeY = (Math.random() - 0.5) * state.screenShakeIntensity;
        ctx.translate(shakeX, shakeY);
      }

      // Keep the arena grounded in the same island artwork as the route.
      ctx.fillStyle = "#115764";
      ctx.fillRect(0, 0, W, H);
      const island = images.current.island;
      if (island?.complete && island.naturalWidth) {
        ctx.drawImage(island, 0, island.naturalHeight * 0.32, island.naturalWidth, island.naturalHeight * 0.38, 0, 0, W, H);
        ctx.fillStyle = "rgba(7, 84, 91, 0.55)";
        ctx.fillRect(0, 0, W, H);
      }

      // Dynamic water caustics pattern
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1.5;
      for (let y = 30; y < H; y += 45) {
        ctx.beginPath();
        const waveOffset = Math.sin(y * 0.04 + elapsed * 1.5) * 16;
        ctx.moveTo(0, y + waveOffset);
        ctx.bezierCurveTo(
          W * 0.33,
          y - 12 + waveOffset,
          W * 0.66,
          y + 12 + waveOffset,
          W,
          y + waveOffset
        );
        ctx.stroke();
      }

      // Player Dash Ghost Trails
      state.dashTrail.forEach((t) => {
        ctx.fillStyle = `rgba(56, 189, 248, ${t.alpha * 0.45})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y - 10, 24, 0, Math.PI * 2);
        ctx.fill();
      });

      // Laser Telegraph & Beam
      if (state.laser) {
        if (state.laser.chargeTimer > 0) {
          ctx.strokeStyle = "rgba(244, 63, 94, 0.75)";
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(state.laser.x, state.laser.y);
          ctx.lineTo(state.laser.targetX, state.laser.targetY);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = "rgba(244, 63, 94, 0.2)";
          ctx.beginPath();
          ctx.arc(state.laser.targetX, state.laser.targetY, 18, 0, Math.PI * 2);
          ctx.fill();
        } else if (state.laser.fireTimer > 0) {
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

      // Rush Telegraph Guideline
      if (state.rushTime > 1.25) {
        ctx.strokeStyle = opponents[opponent].accent;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(state.rushX, state.rushY, 56, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 2. Boss Sprite Rendering (100% Clean Cutout PNG)
      const sprite = images.current.boss;
      const spriteMap = SPRITE_MAPS[opponent];
      if (sprite?.complete && sprite.naturalWidth) {
        let frameRect: Frame;
        let drawHeight: number;

        if (state.bossHp <= 0) {
          const frames = spriteMap.defeated;
          const idx = Math.min(frames.length - 1, Math.floor(state.animTimer * 2) % frames.length);
          frameRect = frames[idx];
          drawHeight = 110;
        } else if (state.isTransforming) {
          const frames = spriteMap.transform;
          const idx = Math.min(frames.length - 1, Math.floor(state.transformProgress * frames.length));
          frameRect = frames[idx];
          drawHeight = 135;

          ctx.strokeStyle = opponents[opponent].accent;
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(state.bossX, state.bossY, 68 + Math.sin(state.animTimer * 15) * 12, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isEnraged) {
          const frames =
            state.rushTime > 0 && state.rushTime < 1.25
              ? spriteMap.phase2Attack
              : spriteMap.phase2Enraged;
          const idx = Math.floor(state.animTimer * 5) % frames.length;
          frameRect = frames[idx];
          drawHeight = 140;

          // Fiery aura
          ctx.strokeStyle = "#f87171";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(state.bossX, state.bossY, 64, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isPhaseTwo) {
          const frames =
            state.rushTime > 0 && state.rushTime < 1.25
              ? spriteMap.phase2Attack
              : spriteMap.phase2Idle;
          const idx = Math.floor(state.animTimer * 4) % frames.length;
          frameRect = frames[idx];
          drawHeight = 130;
        } else {
          const frames =
            state.flinchTimer > 0
              ? spriteMap.humanHit
              : state.rushTime > 0 && state.rushTime < 1.25
              ? spriteMap.humanAttack
              : Math.abs(state.bossX - (W / 2 + Math.sin(elapsed * strafeSpeed) * (W * 0.32))) > 2
              ? spriteMap.humanWalk
              : spriteMap.humanIdle;
          const idx = Math.floor(state.animTimer * 4) % frames.length;
          frameRect = frames[idx];
          drawHeight = 126;
        }

        const [, , sw, sh] = frameRect;
        const aspect = sw / sh;
        const actualWidth = Math.round(drawHeight * aspect);

        // Water Ripple Shadow under Boss
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        ctx.beginPath();
        ctx.ellipse(state.bossX, state.bossY + drawHeight / 2 - 8, Math.min(actualWidth * 0.45, 62), 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw Boss Sprite (pixelated, completely transparent background)
        ctx.drawImage(cleanBossFrame(sprite, frameRect), Math.round(state.bossX - actualWidth / 2), Math.round(state.bossY - drawHeight / 2), actualWidth, drawHeight);

        // White flash when taking damage
        if (state.bossFlashTimer > 0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.beginPath();
          ctx.arc(state.bossX, state.bossY, actualWidth * 0.38, 0, Math.PI * 2);
          ctx.fill();
        }

        // The endurance shield is active until the encounter's minimum time.
        if (state.bossHp > 0 && state.battleTimer < TARGET_RAID_DURATION_SECONDS[opponent]) {
          ctx.save();
          ctx.strokeStyle = `rgba(35, 206, 217, ${0.75 + Math.sin(state.animTimer * 5) * 0.2})`;
          ctx.lineWidth = 4;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.arc(state.bossX, state.bossY, isPhaseTwo ? 85 : 72, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(35, 206, 217, 0.12)";
          ctx.fill();
          ctx.restore();
        }
      }

      // 3. Floating Powerups
      state.powerups.forEach((p) => {
        const pulseScale = 1 + Math.sin(p.pulse) * 0.12;
        const color =
          p.type === "spread"
            ? "#f59e0b"
            : p.type === "shield"
            ? "#3b82f6"
            : p.type === "speed"
            ? "#10b981"
            : "#f43f5e";

        ctx.fillStyle = `${color}33`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * pulseScale * 1.35, 0, Math.PI * 2);
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
        ctx.fillText(
          p.type === "spread" ? "⭐" : p.type === "shield" ? "🛡️" : p.type === "speed" ? "⚡" : "💖",
          p.x,
          p.y
        );
      });

      // 4. Boss Hazards (radius === 11)
      state.hazards.forEach((hazard) => {
        ctx.fillStyle = hazard.color || opponents[opponent].accent;
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(hazard.x - 3, hazard.y - 3, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // 5. Player Shots (radius === 5)
      state.shots.forEach((shot) => {
        ctx.fillStyle = shot.color || "#ffdf73";
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(shot.x, shot.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // 6. Squad Companions & Player Swimmer Rendering
      const avatarImg = images.current.avatar;

      for (const player of lobbyRef.current?.players || []) {
        if (player.self || !player.alive) continue;
        if (avatarImg?.complete && avatarImg.naturalWidth) {
          const [sx, sy] = portraits[player.avatarId] || portraits.fern;
          ctx.drawImage(avatarImg, sx, sy, 275, 415, player.x - 24, player.y - 45, 48, 72);
        }
        ctx.font = "700 12px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = "#103d41";
        ctx.fillText(player.name, player.x, player.y + 40);
      }

      // Player Swimmer
      if (state.invulnerable <= 0 || Math.floor(state.invulnerable * 8) % 2 === 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
        ctx.beginPath();
        ctx.ellipse(state.x, state.y + 26, 22, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        if (avatarImg?.complete && avatarImg.naturalWidth) {
          const [sx, sy] = portraits[game.me.avatarId] || portraits.fern;
          ctx.drawImage(avatarImg, sx, sy, 275, 415, state.x - 27, state.y - 50, 54, 80);
        }

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

      // Aim guide makes the selected firing direction visible on touch and desktop.
      ctx.save();
      ctx.strokeStyle = "#f9d779";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(state.x + controls.current.aimX * 32, state.y + controls.current.aimY * 32);
      ctx.lineTo(state.x + controls.current.aimX * 82, state.y + controls.current.aimY * 82);
      ctx.stroke();
      ctx.restore();

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

      // 9. Alert Ribbon
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

      // Periodically update React HUD
      if (now - displayAt > 100) {
        displayAt = now;
        setHud({
          hp: Math.round(state.hp),
          stage: state.stage,
          squadCount: state.squadCount,
        });
        setDashReady(state.dashCooldown <= 0);
        setActivePowerupUi(state.activePowerup ? `${state.activePowerup.type} (${Math.ceil(state.activePowerup.timer)}s)` : null);

        const m = Math.floor(state.battleTimer / 60);
        const s = Math.floor(state.battleTimer % 60);
        setBattleTimeStr(`${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
      }

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [phase, game.me.avatarId, finish, opponent, dialogueOpen]);

  async function start() {
    if (lobbyRef.current) {
      if (!lobbyRef.current.host || lobbyBusy) return;
      setLobbyBusy(true);
      try { rememberLobby(await lobbyRequest(game.room.id, "start")); }
      catch (error) { setLobbyError(error instanceof Error ? error.message : "Could not start the fight."); }
      finally { setLobbyBusy(false); }
      return;
    }
    const freshBattle = fresh(1, opponent);
    freshBattle.phase = "playing";
    battle.current = freshBattle;
    setResults(null);
    setHud({ hp: 100, stage: "human", squadCount: 1 });
    setPhase("playing");
    setDialogueOpen(true);

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

  function moveAim(event: ReactPointerEvent<HTMLButtonElement>) {
    if (aimPointer.current !== event.pointerId || !aimJoystick.current) return;
    const box = aimJoystick.current.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    const rotated = window.innerHeight > window.innerWidth;
    const localX = rotated ? y : x, localY = rotated ? -x : y;
    const length = Math.hypot(localX, localY);
    if (length < 5) return;
    controls.current.aimX = localX / length;
    controls.current.aimY = localY / length;
    const distance = Math.min(length, Math.min(box.width, box.height) * 0.32);
    setAimKnob({ x: controls.current.aimX * distance, y: controls.current.aimY * distance });
  }

  const currentOpponentConfig = opponents[opponent];
  const targetDurationMin = TARGET_RAID_DURATION_SECONDS[opponent] / 60;

  return (
    <section
      className="boss-screen"
      aria-label={`${currentOpponentConfig.name} boss encounter`}
      data-boss-phase={hud.stage}
    >
      <div className="boss-landscape">
        {/* Top HUD: Tactical Status (Player Health & Squad Counter). Boss health is hidden per repo spec. */}
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

          <div className="boss-timer" aria-label={`Raid timer: ${battleTimeStr}`}>
            <Timer size={14} />
            <span>{battleTimeStr}</span>
          </div>

          <div
            className="boss-squad-badge"
            aria-label={`Raid squad: ${hud.squadCount} swimmers active`}
          >
            <Users size={14} />
            <span>{lobby && phase === "ready" ? lobby.players.length : hud.squadCount} {((lobby && phase === "ready" ? lobby.players.length : hud.squadCount) === 1) ? "SWIMMER" : "SWIMMERS"}</span>
          </div>

          <div className="boss-name-badge" style={{ color: currentOpponentConfig.accent }}>
            <span>{currentOpponentConfig.name}</span>
            <span className="boss-phase-tag">
              {hud.stage === "defeated"
                ? "Defeated"
                : hud.stage === "enraged"
                ? "Overdrive"
                : hud.stage === "transformed"
                ? "Phase 2"
                : "Phase 1"}
            </span>
          </div>

          <div className="boss-hud-actions">
            {activePowerupUi && (
              <span
                className={`boss-powerup-badge ${
                  activePowerupUi.startsWith("spread")
                    ? "spread"
                    : activePowerupUi.startsWith("shield")
                    ? "shield"
                    : activePowerupUi.startsWith("heal")
                    ? "heal"
                    : "speed"
                }`}
              >
                {activePowerupUi.startsWith("spread") ? (
                  <Zap size={12} />
                ) : activePowerupUi.startsWith("shield") ? (
                  <Shield size={12} />
                ) : activePowerupUi.startsWith("heal") ? (
                  <Heart size={12} />
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
                <span className="boss-kicker">
                  BOSS ENCOUNTER · SOLO PRACTICE OR CREW RAID
                </span>

                {/* Boss Switcher Tabs */}
                {phase === "ready" && (
                  <div className="boss-opponents-picker" role="tablist">
                    {(["kirkify", "diddy", "epstein"] as Opponent[]).map((oppKey) => {
                      const cfg = opponents[oppKey];
                      const active = opponent === oppKey;
                      return (
                        <button
                          key={oppKey}
                          type="button"
                          className={`boss-opponent-tab ${active ? "active" : ""}`}
                          onClick={() => { if (oppKey !== opponent) { setLoaded(false); setLoadError(false); setOpponent(oppKey); } }}
                          disabled={!!lobby || lobbyBusy}
                          role="tab"
                          aria-selected={active}
                        >
                          <Swords size={13} />
                          <span>{cfg.name}</span>
                          <small>Day {cfg.day} · {cfg.targetMinutes}m</small>
                        </button>
                      );
                    })}
                  </div>
                )}

                <h1>
                  {phase === "won"
                    ? `You defeated ${currentOpponentConfig.name}!`
                    : phase === "lost"
                    ? "The encounter ended"
                    : `Face ${currentOpponentConfig.name}`}
                </h1>

                <p>
                  {phase === "won"
                    ? `You held on and defeated ${currentOpponentConfig.name}.`
                    : phase === "lost"
                    ? "The encounter ended. Try again when you’re ready."
                    : "Dodge attacks, aim your shots and survive the encounter."}
                </p>

                {phase === "ready" && (
                  <>
                    <div className="boss-brief"><span><Timer size={16} /> {targetDurationMin}-minute encounter</span><span><Shield size={16} /> Endurance shield</span></div>
                    <p className="boss-endurance-note">The shield prevents a knockout before {targetDurationMin} minutes. Boss health increases for each player in the lobby.</p>
                    {lobby ? <section className="raid-lobby" aria-label="Crew lobby">
                      <div className="raid-lobby-heading"><strong><Users size={17} /> Crew lobby</strong><span>{lobby.players.length} joined</span></div>
                      <div className="raid-lobby-players">{lobby.players.map(player => <div className="raid-lobby-player" key={player.id}><PlayerAvatar avatarId={player.avatarId} accent={player.avatarAccent} size={34} /><span>{player.self ? "You" : player.name}</span></div>)}</div>
                      <p>{lobby.host ? "Wait for your crew, then start when everyone is ready." : "Waiting for the host to start."}</p>
                      <button className="raid-leave" onClick={() => void leaveLobby()} disabled={lobbyBusy}>Leave lobby</button>
                    </section> : game.mode === "online" && game.room.id ? <button className="raid-join" onClick={() => void enterLobby()} disabled={lobbyBusy}><Users size={17} /> Join or create crew lobby</button> : <p className="boss-endurance-note">Solo practice is on this device. Sign in and join a crew room to play together.</p>}
                    {lobbyError && <p className="boss-error" role="alert">{lobbyError}</p>}
                  </>
                )}

                {results && (
                  <div className="boss-results" aria-label="Encounter summary">
                    <div>
                      <strong>{results.durationStr}</strong>
                      <span>Fight Duration</span>
                    </div>
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

                <p className="boss-small">Move, aim, hold attack and dash to dodge.</p>

                {loadError ? (
                  <p className="boss-error">
                    The sprite sheets could not load. Reconnect and reload this page.
                  </p>
                ) : lobby && phase !== "ready" ? (
                  <button className="boss-start" onClick={() => void leaveLobby()} disabled={lobbyBusy}>Leave crew raid</button>
                ) : (
                  <button className="boss-start" onClick={() => void start()} disabled={!loaded || lobbyBusy || (!!lobby && !lobby.host)}>
                    {!loaded
                      ? "Loading sprites…"
                      : phase === "ready"
                      ? lobby ? lobby.host ? "Start crew raid" : "Waiting for host" : "Start solo practice"
                      : "Try again"}
                  </button>
                )}

                <Link href="/" className="boss-exit" onClick={() => { if (lobbyRef.current) void lobbyRequest(game.room.id, "leave").catch(() => {}); }}>
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
                  ref={aimJoystick}
                  className="boss-aim"
                  aria-label="Aim and fire joystick. Keyboard: I J K L"
                  onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); aimPointer.current = event.pointerId; controls.current.attack = true; moveAim(event); }}
                  onPointerMove={moveAim}
                  onPointerUp={event => { if (aimPointer.current === event.pointerId) { aimPointer.current = null; controls.current.attack = false; setAimKnob({ x: 0, y: 0 }); } }}
                  onPointerCancel={() => { aimPointer.current = null; controls.current.attack = false; setAimKnob({ x: 0, y: 0 }); }}
                  onLostPointerCapture={() => { aimPointer.current = null; controls.current.attack = false; setAimKnob({ x: 0, y: 0 }); }}
                ><span style={{ transform: `translate(${aimKnob.x}px, ${aimKnob.y}px)` }} /><small>AIM</small></button>
                <button
                  className="boss-dash"
                  aria-label="Dodge dash (Keyboard: Shift)"
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
          {phase === "playing" && dialogueOpen && <div className="boss-dialogue" role="dialog" aria-modal="true" aria-labelledby="boss-dialogue-name">
            <div className="boss-dialogue-art"><DialoguePortrait opponent={opponent} /></div>
            <div className="boss-dialogue-box"><strong id="boss-dialogue-name">{currentOpponentConfig.name.toUpperCase()}</strong><p>{opponent === "kirkify" ? "You think you can make it past me?" : opponent === "diddy" ? "The tide turns against you here." : "There is no easy way off this island."}</p><button onClick={() => setDialogueOpen(false)} autoFocus>Let&apos;s fight <Swords size={15} aria-hidden="true" /></button></div>
          </div>}
          {phase === "playing" && lobbyError && <p className="raid-connection" role="status">{lobbyError}</p>}
        </div>

        <p className="boss-rotate-hint">
          Rotate your phone for a wider view · WASD to move, IJKL to aim, Space to attack, Shift to dash
        </p>
      </div>
    </section>
  );
}
