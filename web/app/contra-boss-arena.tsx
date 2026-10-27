"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  BOSS_CONFIGS,
  type BossId,
  type BossConfig,
} from "../lib/boss-battle";
import { contraAudio } from "../lib/contra-audio";
import { Volume2, VolumeX, Zap, Sparkles } from "lucide-react";

interface ContraBossArenaProps {
  bossId: BossId;
  crewCount: number;
  requiredCrewCount: number;
  hasMetThreshold: boolean;
  onVictory: () => void;
  onDefeat: () => void;
  onRallyCrew: () => void;
  reviveTrigger?: number; // increments when revive is pressed to reboot player
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  isGrounded: boolean;
  isDucking: boolean;
  hp: number;
  maxHp: number;
  invulnerableTime: number;
  facing: 1 | -1;
}

interface CrewCompanionState {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isGrounded: boolean;
  shootCooldown: number;
  color: string;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fromCrew: boolean;
  damage: number;
  color: string;
}

interface BossProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: "coconut" | "laser" | "money-bomb";
  bounces?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 270;
const GROUND_Y = 225;
const GRAVITY = 0.55;

export function ContraBossArena({
  bossId,
  crewCount,
  requiredCrewCount,
  hasMetThreshold,
  onVictory,
  onDefeat,
  onRallyCrew,
  reviveTrigger = 0,
}: ContraBossArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bossConfig: BossConfig = BOSS_CONFIGS[bossId];

  const [soundOn, setSoundOn] = useState(true);
  const [autoFire, setAutoFire] = useState(true);
  const [playerHpDisplay, setPlayerHpDisplay] = useState(100);
  const [bossHpDisplay, setBossHpDisplay] = useState(bossConfig.maxHp);
  const [customImageLoaded, setCustomImageLoaded] = useState(false);
  const bossImageRef = useRef<HTMLImageElement | null>(null);

  // Input states
  const keys = useRef({
    left: false,
    right: false,
    jump: false,
    duck: false,
    shoot: false,
  });

  // Game state references
  const playerRef = useRef<PlayerState>({
    x: 45,
    y: GROUND_Y - 32,
    vx: 0,
    vy: 0,
    width: 22,
    height: 32,
    isGrounded: true,
    isDucking: false,
    hp: 100,
    maxHp: 100,
    invulnerableTime: 0,
    facing: 1,
  });

  const companionsRef = useRef<CrewCompanionState[]>([
    { id: "c1", name: "Kai", x: 20, y: GROUND_Y - 28, vx: 0, vy: 0, isGrounded: true, shootCooldown: 30, color: "#38bdf8" },
    { id: "c2", name: "Maya", x: 70, y: GROUND_Y - 28, vx: 0, vy: 0, isGrounded: true, shootCooldown: 50, color: "#f43f5e" },
  ]);

  const bossStateRef = useRef({
    x: CANVAS_WIDTH - 75,
    y: GROUND_Y - 65,
    width: 55,
    height: 65,
    vy: 1,
    hp: bossConfig.maxHp,
    maxHp: bossConfig.maxHp,
    attackTimer: 0,
    flashTimer: 0,
  });

  const bulletsRef = useRef<Bullet[]>([]);
  const projectilesRef = useRef<BossProjectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const gameOverHandled = useRef(false);

  // Load custom boss image if exists
  useEffect(() => {
    const img = new Image();
    img.src = bossConfig.customImagePath;
    img.onload = () => {
      bossImageRef.current = img;
      setCustomImageLoaded(true);
    };
    img.onerror = () => {
      bossImageRef.current = null;
      setCustomImageLoaded(false);
    };
  }, [bossConfig.customImagePath]);

  // Handle Revive reboot
  useEffect(() => {
    if (reviveTrigger > 0) {
      playerRef.current.hp = 100;
      playerRef.current.invulnerableTime = 90; // 1.5s invincibility shield
      playerRef.current.x = 45;
      playerRef.current.y = GROUND_Y - 32;
      const frame = requestAnimationFrame(() => setPlayerHpDisplay(100));
      gameOverHandled.current = false;
      contraAudio.playRevive();
      return () => cancelAnimationFrame(frame);
    }
  }, [reviveTrigger]);

  // Handle audio toggle
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    contraAudio.setEnabled(next);
  };

  // Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") keys.current.left = true;
      if (k === "arrowright" || k === "d") keys.current.right = true;
      if (k === "arrowup" || k === "w" || k === " ") {
        if (!keys.current.jump) {
          keys.current.jump = true;
          if (playerRef.current.isGrounded) {
            playerRef.current.vy = -10.5;
            playerRef.current.isGrounded = false;
            contraAudio.playJump();
          }
        }
      }
      if (k === "arrowdown" || k === "s") keys.current.duck = true;
      if (k === "z" || k === "j" || k === "k") keys.current.shoot = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") keys.current.left = false;
      if (k === "arrowright" || k === "d") keys.current.right = false;
      if (k === "arrowup" || k === "w" || k === " ") keys.current.jump = false;
      if (k === "arrowdown" || k === "s") keys.current.duck = false;
      if (k === "z" || k === "j" || k === "k") keys.current.shoot = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Spawn spark particle
  const spawnParticles = useCallback((x: number, y: number, color: string, count = 6) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 0,
        maxLife: Math.floor(Math.random() * 12) + 10,
        color,
        size: Math.random() * 3 + 2,
      });
    }
  }, []);

  // Main 60fps Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let shootTimer = 0;
    gameOverHandled.current = false;

    // Reset boss hp for current encounter
    bossStateRef.current.hp = bossConfig.maxHp;
    bossStateRef.current.maxHp = bossConfig.maxHp;
    setBossHpDisplay(bossConfig.maxHp);
    setPlayerHpDisplay(playerRef.current.hp);

    const loop = () => {
      // 1. UPDATE PLAYER
      const p = playerRef.current;
      p.isDucking = keys.current.duck && p.isGrounded;
      p.height = p.isDucking ? 20 : 32;

      // Horizontal move
      if (keys.current.left) {
        p.vx = -3.2;
        p.facing = -1;
      } else if (keys.current.right) {
        p.vx = 3.2;
        p.facing = 1;
      } else {
        p.vx *= 0.75;
      }

      p.x += p.vx;
      // Boundaries
      p.x = Math.max(12, Math.min(CANVAS_WIDTH - 120, p.x));

      // Gravity & Jump
      p.vy += GRAVITY;
      p.y += p.vy;

      if (p.y >= GROUND_Y - p.height) {
        p.y = GROUND_Y - p.height;
        p.vy = 0;
        p.isGrounded = true;
      }

      if (p.invulnerableTime > 0) p.invulnerableTime--;

      // Player Shoot (Manual or Auto-Fire)
      shootTimer++;
      if ((keys.current.shoot || autoFire) && shootTimer >= 9) {
        shootTimer = 0;
        const bulletY = p.isDucking ? p.y + 12 : p.y + 8;
        bulletsRef.current.push({
          x: p.x + p.width,
          y: bulletY,
          vx: 8.5,
          vy: 0,
          fromCrew: false,
          damage: 5,
          color: "#facc15",
        });
        contraAudio.playShoot();
      }

      // 2. UPDATE CREW COMPANIONS
      companionsRef.current.forEach(c => {
        // AI: Follow near player, jump randomly over projectiles, shoot boss
        const targetX = p.x + (c.id === "c1" ? -28 : 26);
        c.x += (targetX - c.x) * 0.08;
        c.vy += GRAVITY;
        c.y += c.vy;
        if (c.y >= GROUND_Y - 28) {
          c.y = GROUND_Y - 28;
          c.vy = 0;
          c.isGrounded = true;
        }

        // Jump if ground projectile nearby
        const incoming = projectilesRef.current.some(proj => Math.abs(proj.x - c.x) < 40 && proj.y > GROUND_Y - 35);
        if (incoming && c.isGrounded) {
          c.vy = -9.5;
          c.isGrounded = false;
        }

        // Support shoot
        c.shootCooldown--;
        if (c.shootCooldown <= 0) {
          c.shootCooldown = Math.floor(Math.random() * 20) + 35;
          bulletsRef.current.push({
            x: c.x + 18,
            y: c.y + 10,
            vx: 7.5,
            vy: (Math.random() - 0.5) * 0.8,
            fromCrew: true,
            damage: 3,
            color: c.color,
          });
        }
      });

      // 3. UPDATE BOSS
      const boss = bossStateRef.current;
      boss.y += boss.vy;
      if (boss.y < 80 || boss.y > GROUND_Y - boss.height - 10) {
        boss.vy *= -1;
      }
      if (boss.flashTimer > 0) boss.flashTimer--;

      // Boss Attack Cycle
      boss.attackTimer++;
      if (boss.attackTimer >= Math.floor(bossConfig.attackSpeed / 16.6)) {
        boss.attackTimer = 0;

        if (bossConfig.projectileType === "coconuts") {
          // Tumz: Bouncing coconut artillery
          projectilesRef.current.push({
            x: boss.x - 10,
            y: boss.y + 20,
            vx: -bossConfig.bulletSpeed,
            vy: -3.5,
            radius: 8,
            type: "coconut",
            bounces: 3,
          });
        } else if (bossConfig.projectileType === "lasers") {
          // Mabs: 3-way spread laser barrage
          [-1.5, 0, 1.5].forEach(vy => {
            projectilesRef.current.push({
              x: boss.x - 10,
              y: boss.y + 25,
              vx: -bossConfig.bulletSpeed,
              vy,
              radius: 6,
              type: "laser",
            });
          });
        } else {
          // Epstein: Money bomb cluster + rapid laser
          projectilesRef.current.push({
            x: boss.x - 10,
            y: boss.y + 15,
            vx: -bossConfig.bulletSpeed,
            vy: (Math.random() - 0.5) * 2,
            radius: 9,
            type: "money-bomb",
          });
          // Extra low ground projectile
          projectilesRef.current.push({
            x: boss.x - 10,
            y: GROUND_Y - 12,
            vx: -bossConfig.bulletSpeed * 1.1,
            vy: 0,
            radius: 7,
            type: "money-bomb",
          });
        }
      }

      // 4. UPDATE BULLETS & CHECK BOSS HIT
      bulletsRef.current = bulletsRef.current.filter(b => {
        b.x += b.vx;
        b.y += b.vy;

        // Hit Boss check
        if (
          b.x >= boss.x &&
          b.x <= boss.x + boss.width &&
          b.y >= boss.y &&
          b.y <= boss.y + boss.height
        ) {
          // Damage calculation (Reduced if <30% crew threshold)
          const actualDmg = hasMetThreshold ? b.damage : Math.max(1, Math.floor(b.damage * 0.35));
          boss.hp = Math.max(0, boss.hp - actualDmg);
          boss.flashTimer = 4;
          setBossHpDisplay(boss.hp);
          spawnParticles(b.x, b.y, b.color, 4);
          contraAudio.playBossHit();

          if (boss.hp <= 0 && !gameOverHandled.current) {
            gameOverHandled.current = true;
            spawnParticles(boss.x + boss.width / 2, boss.y + boss.height / 2, "#facc15", 25);
            contraAudio.playVictory();
            setTimeout(() => onVictory(), 700);
          }
          return false;
        }

        return b.x < CANVAS_WIDTH + 20;
      });

      // 5. UPDATE BOSS PROJECTILES & CHECK PLAYER HIT
      projectilesRef.current = projectilesRef.current.filter(proj => {
        proj.x += proj.vx;
        proj.y += proj.vy;

        // Bouncing for coconuts
        if (proj.type === "coconut" && proj.y >= GROUND_Y - proj.radius) {
          proj.y = GROUND_Y - proj.radius;
          proj.vy = -Math.abs(proj.vy) * 0.8;
          if (proj.bounces && proj.bounces > 0) proj.bounces--;
        } else if (proj.type === "coconut") {
          proj.vy += 0.3; // Gravity for coconuts
        }

        // Check Player collision
        if (p.invulnerableTime <= 0) {
          const hitPlayer =
            proj.x + proj.radius >= p.x &&
            proj.x - proj.radius <= p.x + p.width &&
            proj.y + proj.radius >= p.y &&
            proj.y - proj.radius <= p.y + p.height;

          if (hitPlayer) {
            p.hp = Math.max(0, p.hp - 20);
            p.invulnerableTime = 70; // ~1.2s invulnerability
            setPlayerHpDisplay(p.hp);
            spawnParticles(p.x + p.width / 2, p.y + p.height / 2, "#ef4444", 8);
            contraAudio.playPlayerHit();

            if (p.hp <= 0 && !gameOverHandled.current) {
              gameOverHandled.current = true;
              setTimeout(() => onDefeat(), 400);
            }
            return false;
          }
        }

        return proj.x > -20 && proj.y < CANVAS_HEIGHT + 20;
      });

      // 6. UPDATE PARTICLES
      particlesRef.current = particlesRef.current.filter(pt => {
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life++;
        return pt.life < pt.maxLife;
      });

      // ==========================================
      // 7. RENDER FRAME (RETRO RUN-AND-GUN GRAPHICS)
      // ==========================================
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Arena Sky & Parallax Horizon
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      skyGrad.addColorStop(0, "#0f172a");
      skyGrad.addColorStop(0.7, "#1e293b");
      skyGrad.addColorStop(1, "#334155");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y);

      // Distant Island Mountains
      ctx.fillStyle = "#1e3a34";
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(60, 160);
      ctx.lineTo(140, GROUND_Y);
      ctx.lineTo(240, 140);
      ctx.lineTo(330, GROUND_Y);
      ctx.lineTo(420, 150);
      ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
      ctx.fill();

      // Ground / Arena Platform
      const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT);
      groundGrad.addColorStop(0, "#164e32");
      groundGrad.addColorStop(0.2, "#0d2818");
      groundGrad.addColorStop(1, "#05140c");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

      // Platform Border Glow line
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
      ctx.stroke();

      // Render Crew Companions
      companionsRef.current.forEach(c => {
        ctx.fillStyle = c.color;
        // Body
        ctx.beginPath();
        ctx.roundRect(c.x, c.y, 18, 28, 4);
        ctx.fill();
        // Companion Blaster
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(c.x + 14, c.y + 10, 8, 4);
        // Name tag
        ctx.font = "8px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(c.name, c.x + 9, c.y - 4);
      });

      // Render Player (Chibi explorer with blaster)
      if (p.invulnerableTime % 8 < 4) {
        // Body
        ctx.fillStyle = "#10b981";
        ctx.beginPath();
        ctx.roundRect(p.x, p.y, p.width, p.height, 5);
        ctx.fill();

        // Face & Hair
        ctx.fillStyle = "#fcd34d";
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + (p.isDucking ? 6 : 8), 7, 0, Math.PI * 2);
        ctx.fill();

        // Eye visor
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(p.x + (p.facing === 1 ? 8 : 4), p.y + (p.isDucking ? 4 : 6), 5, 3);

        // Contra Blaster Gun
        ctx.fillStyle = "#cbd5e1";
        const gunX = p.facing === 1 ? p.x + p.width - 2 : p.x - 10;
        const gunY = p.isDucking ? p.y + 11 : p.y + 9;
        ctx.fillRect(gunX, gunY, 14, 5);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(gunX + 10, gunY + 1, 4, 3);
      }

      // Render Bullets
      bulletsRef.current.forEach(b => {
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(b.x, b.y - 1.5, 9, 3);
        ctx.shadowBlur = 0;
      });

      // Render Boss
      const bImg = bossImageRef.current;
      if (boss.flashTimer > 0) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(boss.x, boss.y, boss.width, boss.height, 8);
        ctx.fill();
      } else if (bImg && customImageLoaded) {
        ctx.drawImage(bImg, boss.x, boss.y, boss.width, boss.height);
      } else {
        // Stylized Placeholder Boss
        ctx.fillStyle = bossConfig.themeColor;
        ctx.beginPath();
        ctx.roundRect(boss.x, boss.y, boss.width, boss.height, 10);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Boss Aura
        ctx.strokeStyle = bossConfig.accentColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(boss.x + boss.width / 2, boss.y + boss.height / 2, boss.width * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        // Text fallback when the boss artwork is unavailable.
        ctx.font = "28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(bossConfig.placeholderIcon, boss.x + boss.width / 2, boss.y + boss.height / 2 + 10);
      }

      // Shield overlay if < 30% crew threshold
      if (!hasMetThreshold) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(boss.x + boss.width / 2, boss.y + boss.height / 2, boss.width * 0.75, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Render Boss Projectiles
      projectilesRef.current.forEach(proj => {
        ctx.save();
        if (proj.type === "coconut") {
          ctx.fillStyle = "#78350f";
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#d97706";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (proj.type === "laser") {
          ctx.fillStyle = "#a855f7";
          ctx.shadowColor = "#c084fc";
          ctx.shadowBlur = 8;
          ctx.fillRect(proj.x - proj.radius, proj.y - 2, proj.radius * 2, 4);
        } else {
          // Money Bomb
          ctx.fillStyle = "#22c55e";
          ctx.shadowColor = "#86efac";
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "9px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("$", proj.x, proj.y + 3);
        }
        ctx.restore();
      });

      // Render Particles
      particlesRef.current.forEach(pt => {
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = 1 - pt.life / pt.maxLife;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      });
      ctx.globalAlpha = 1;

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [bossConfig, autoFire, hasMetThreshold, onVictory, onDefeat, spawnParticles, customImageLoaded]);

  // Touch control handlers
  const handleTouchStart = (action: keyof typeof keys.current) => {
    if (action === "jump") {
      if (playerRef.current.isGrounded) {
        playerRef.current.vy = -10.5;
        playerRef.current.isGrounded = false;
        contraAudio.playJump();
      }
    }
    keys.current[action] = true;
  };

  const handleTouchEnd = (action: keyof typeof keys.current) => {
    keys.current[action] = false;
  };

  return (
    <div className="contra-game-container">
      {/* Top HUD: Health & Audio */}
      <div className="contra-hud-row">
        {/* Player HP */}
        <div className="contra-hp-box">
          <span className="contra-hp-label">PLAYER HP</span>
          <div className="contra-hp-track">
            <div
              className="contra-hp-fill player-fill"
              style={{ transform: `scaleX(${Math.max(0, playerHpDisplay / 100)})` }}
            />
          </div>
          <span className="contra-hp-val">{playerHpDisplay}/100</span>
        </div>

        {/* Quick Toggles */}
        <div className="contra-quick-toggles">
          <button
            className={`contra-toggle-chip ${autoFire ? "is-active" : ""}`}
            onClick={() => setAutoFire(!autoFire)}
            title="Toggle Continuous Blaster Fire"
          >
            <Zap size={13} /> {autoFire ? "AUTO-FIRE ON" : "AUTO-FIRE OFF"}
          </button>
          <button
            className="contra-audio-btn"
            onClick={toggleSound}
            aria-label={soundOn ? "Mute audio" : "Enable sound"}
          >
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>

        {/* Boss HP */}
        <div className="contra-hp-box boss-hp">
          <span className="contra-hp-label" style={{ color: bossConfig.themeColor }}>
            {bossConfig.name.toUpperCase()} HP
          </span>
          <div className="contra-hp-track">
            <div
              className="contra-hp-fill boss-fill"
              style={{
                background: bossConfig.themeColor,
                transform: `scaleX(${Math.max(0, bossHpDisplay / bossConfig.maxHp)})`,
              }}
            />
          </div>
          <span className="contra-hp-val">{bossHpDisplay}/{bossConfig.maxHp}</span>
        </div>
      </div>

      {/* 30% Crew Warning Banner */}
      {!hasMetThreshold && (
        <div className="contra-crew-barrier-alert">
          <Sparkles size={14} />
          <span>
            <b>BOSS SHIELD ACTIVE:</b> Need ≥30% of Crew ({requiredCrewCount} players) for full blaster damage!
          </span>
          <button className="contra-inline-rally-btn" onClick={onRallyCrew}>
            Rally Crew
          </button>
        </div>
      )}

      {/* Contra Arcade Canvas */}
      <div className="contra-canvas-viewport">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="contra-canvas"
        />
      </div>

      {/* Touch D-Pad and Action Buttons for Mobile / Mouse */}
      <div className="contra-touch-controls">
        {/* Left D-pad */}
        <div className="contra-dpad">
          <button
            className="dpad-btn dpad-left"
            onPointerDown={() => handleTouchStart("left")}
            onPointerUp={() => handleTouchEnd("left")}
            onPointerLeave={() => handleTouchEnd("left")}
            aria-label="Move Left"
          >
            ◀
          </button>
          <div className="dpad-center" />
          <button
            className="dpad-btn dpad-right"
            onPointerDown={() => handleTouchStart("right")}
            onPointerUp={() => handleTouchEnd("right")}
            onPointerLeave={() => handleTouchEnd("right")}
            aria-label="Move Right"
          >
            ▶
          </button>
          <button
            className="dpad-btn dpad-down"
            onPointerDown={() => handleTouchStart("duck")}
            onPointerUp={() => handleTouchEnd("duck")}
            onPointerLeave={() => handleTouchEnd("duck")}
            aria-label="Duck / Crouch"
          >
            ▼ DUCK
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="contra-action-pad">
          <button
            className="contra-action-btn jump-btn"
            onPointerDown={() => handleTouchStart("jump")}
            onPointerUp={() => handleTouchEnd("jump")}
            onPointerLeave={() => handleTouchEnd("jump")}
            aria-label="Jump / Dodge"
          >
            JUMP
          </button>

          {!autoFire && (
            <button
              className="contra-action-btn fire-btn"
              onPointerDown={() => handleTouchStart("shoot")}
              onPointerUp={() => handleTouchEnd("shoot")}
              onPointerLeave={() => handleTouchEnd("shoot")}
              aria-label="Fire Blaster"
            >
              FIRE
            </button>
          )}
        </div>
      </div>

      {/* Desktop Keyboard Control Legend */}
      <div className="contra-legend-row">
                <span><b>A / D / Arrows:</b> Run</span>
        <span><b>W / Space:</b> Jump</span>
        <span><b>S / Down:</b> Duck</span>
        <span><b>Z / J:</b> Shoot</span>
      </div>
    </div>
  );
}
