"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Compass,
  Diamond,
  Download,
  Flag,
  Flame,
  Gift,
  Lock,
  LocateFixed,
  MailOpen,
  Maximize2,
  RefreshCw,
  Sparkles,
  Trophy,
  Swords,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { landmarkForDay, ROUTE_HEIGHT, routePoint } from "../lib/escape-route";
import { useGame } from "./game-provider";
import { PlayerAvatar } from "./avatar";
import { contraAudio } from "../lib/contra-audio";

const REWARD_PHOTOS = [
  {
    id: "harbor-boat",
    title: "The Escape Sailboat",
    caption: "Docked at the northern harbor pier — your vessel away from the island.",
    src: "/images/escape-island.webp",
    alt: "The escape sailboat docked at the tropical harbor pier",
    tag: "Day 30 Milestone",
  },
  {
    id: "island-aerial",
    title: "Island Horizon",
    caption: "The entire 30-day journey behind you: beaches, dense jungle, and open sea.",
    src: "/images/island-board-v2.webp",
    alt: "Aerial survey map of the island escape route",
    tag: "Journey Complete",
  },
];

export default function EscapeScreen() {
  const game = useGame();
  const router = useRouter();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [crewOpen, setCrewOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(true);
  const [rewardSelected, setRewardSelected] = useState(false);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [chestAnimStage, setChestAnimStage] = useState<"idle" | "shaking" | "opening" | "opened">("idle");
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null);
  // Active player name from game context (online username or practice name)
  const currentAppUsername =
    game.username && game.username !== "You"
      ? game.username
      : game.me?.name && game.me.name !== "You"
      ? game.me.name
      : "";

  const [certificateName, setCertificateName] = useState(() => {
    if (currentAppUsername) return { name: currentAppUsername, username: currentAppUsername };
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("escape-certificate-custom-name");
      if (saved && saved.trim() && saved !== "Survivor") return { name: saved, username: currentAppUsername };
    }
    return { name: "Survivor", username: currentAppUsername };
  });
  const playerName = currentAppUsername && (certificateName.username !== currentAppUsername || !certificateName.name || certificateName.name === "Survivor")
    ? currentAppUsername
    : certificateName.name;

  // Automatically update when user's name changes in settings or room
  const prevUsernameRef = useRef(currentAppUsername);
  useEffect(() => {
    if (currentAppUsername && currentAppUsername !== prevUsernameRef.current) {
      prevUsernameRef.current = currentAppUsername;
      if (typeof window !== "undefined") {
        localStorage.setItem("escape-certificate-custom-name", currentAppUsername);
      }
    }
  }, [currentAppUsername]);

  function handleNameChange(newName: string) {
    setCertificateName({ name: newName, username: currentAppUsername });
    if (typeof window !== "undefined") {
      localStorage.setItem("escape-certificate-custom-name", newName);
    }
  }

  const completed = Math.min(30, game.checkInCount);
  const nextDay = Math.min(30, Math.max(1, completed + (game.checked ? 0 : 1)));
  const selectedDay = selection ?? nextDay;
  const selected = landmarkForDay(selectedDay);
  const selectedDone = selectedDay <= completed;
  const selectedFuture = selectedDay > nextDay;
  const traveler = routePoint(completed);
  const chaserProgress = Math.max(0, completed - 2);
  const chaser = routePoint(chaserProgress);
  const nodes = Array.from({ length: 30 }, (_, index) => index + 1);
  const rewardUnlocked = completed >= 30 && (game.me.alive || !!game.me.won) && (game.mode !== "practice" || game.streak >= 30);
  const crew = game.mode === "online" && game.room.id ? game.players : [];
  const selectedPlayer = crew.find(player => player.id === selectedPlayerId);

  // Players with no check-ins are waiting at the first checkpoint, not on day 1 yet.
  const crewAtDay = (day: number) => crew.filter(player => Math.max(1, Math.min(30, player.progress)) === day);
  const selectedCrew = crewAtDay(selectedDay);

  // Calculate 7-day streak calendar (Mon - Sun) inspired by reference image
  const todayDate = new Date(`${game.day}T00:00:00Z`);
  const dayOfWeek = (todayDate.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6
  const weekStart = new Date(todayDate);
  weekStart.setUTCDate(todayDate.getUTCDate() - dayOfWeek);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][i];
    const isLogged = game.checkInDates.includes(dateStr);
    const isCurrent = dateStr === game.day;
    const isPast = dateStr < game.day;
    return { dateStr, dayLabel, isLogged, isCurrent, isPast };
  });

  const escapePercent = Math.min(100, Math.round((completed / 30) * 100));

  function handleOpenChest() {
    setRewardOpen(true);
    setChestAnimStage("shaking");
    try {
      contraAudio.playRevive();
    } catch {}

    const timer1 = setTimeout(() => {
      setChestAnimStage("opening");
      try {
        contraAudio.playVictory();
      } catch {}
    }, 450);

    const timer2 = setTimeout(() => {
      setChestAnimStage("opened");
    }, 1100);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }

  function handleReplayChest() {
    setChestAnimStage("idle");
    setTimeout(() => {
      handleOpenChest();
    }, 120);
  }

  function downloadCertificate() {
    if (typeof window === "undefined") return;
    const certCanvas = document.createElement("canvas");
    const ctx = certCanvas.getContext("2d");
    if (!ctx) return;

    // Standard Landscape Certificate Dimensions (11" x 8.5" at 200 DPI: 2200 x 1700 px)
    certCanvas.width = 2200;
    certCanvas.height = 1700;

    // Background: ivory parchment with radial warmth
    const bgGrad = ctx.createRadialGradient(1100, 850, 150, 1100, 850, 1300);
    bgGrad.addColorStop(0, "#fffefb");
    bgGrad.addColorStop(0.65, "#fbf5e7");
    bgGrad.addColorStop(1, "#eee0c4");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 2200, 1700);

    // Deep forest green primary border
    ctx.strokeStyle = "#086870";
    ctx.lineWidth = 18;
    ctx.strokeRect(50, 50, 2100, 1600);

    // Gold inner border
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 5;
    ctx.strokeRect(80, 80, 2040, 1540);

    // Secondary thin gold outline
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.strokeRect(95, 95, 2010, 1510);

    // Corner decorative accents
    const drawCorner = (x: number, y: number, angle: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(60, 0);
      ctx.arc(60, 60, 60, -Math.PI / 2, 0);
      ctx.lineTo(60, 60);
      ctx.stroke();
      ctx.fillStyle = "#ca8a04";
      ctx.beginPath();
      ctx.arc(30, 30, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    drawCorner(110, 110, 0);
    drawCorner(2090, 110, Math.PI / 2);
    drawCorner(2090, 1590, Math.PI);
    drawCorner(110, 1590, -Math.PI / 2);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Top Medal Medallion
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(1100, 260, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(1100, 260, 48, 0, Math.PI * 2);
    ctx.stroke();

    const drawMedalStar = (cx: number, cy: number, spikes: number, outerR: number, innerR: number) => {
      let rot = (Math.PI / 2) * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;
      ctx.beginPath();
      ctx.moveTo(cx, cy - outerR);
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerR;
        y = cy + Math.sin(rot) * outerR;
        ctx.lineTo(x, y);
        rot += step;
        x = cx + Math.cos(rot) * innerR;
        y = cy + Math.sin(rot) * innerR;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerR);
      ctx.closePath();
      ctx.fillStyle = "#78350f";
      ctx.fill();
    };
    drawMedalStar(1100, 260, 5, 26, 12);

    // Header Title: CERTIFICATE OF SURVIVAL
    ctx.font = 'bold 64px "Times New Roman", Georgia, serif';
    ctx.fillStyle = "#103d41";
    ctx.fillText("CERTIFICATE OF SURVIVAL", 1100, 395);

    // Subtitle
    ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = "#b45309";
    ctx.fillText("NO NUT NOVEMBER 2026 · ISLAND ESCAPE", 1100, 465);

    // Divider line
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(650, 515);
    ctx.lineTo(1550, 515);
    ctx.stroke();

    ctx.fillStyle = "#ca8a04";
    ctx.beginPath();
    ctx.arc(1100, 515, 6, 0, Math.PI * 2);
    ctx.fill();

    // "This officially certifies that"
    ctx.font = 'italic 30px "Times New Roman", Georgia, serif';
    ctx.fillStyle = "#475569";
    ctx.fillText("This officially certifies that", 1100, 605);

    // Recipient Name
    const nameToDraw = (playerName || "SURVIVOR").toUpperCase();
    ctx.font = 'bold 76px "Times New Roman", Georgia, serif';
    ctx.fillStyle = "#0f172a";
    ctx.fillText(nameToDraw, 1100, 715);

    // Name underline
    const measured = Math.max(500, ctx.measureText(nameToDraw).width + 100);
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(1100 - measured / 2, 775);
    ctx.lineTo(1100 + measured / 2, 775);
    ctx.stroke();

    // Citation
    ctx.font = '28px "Times New Roman", Georgia, serif';
    ctx.fillStyle = "#1e293b";
    ctx.fillText(
      "has demonstrated extraordinary willpower, ironclad discipline, and honesty",
      1100,
      885
    );
    ctx.fillText(
      "by conquering thirty consecutive days of the November challenge and escaping the island undefeated.",
      1100,
      940
    );

    // Stats row
    ctx.font = '800 24px -apple-system, sans-serif';
    ctx.fillStyle = "#086870";
    ctx.fillText(
      `30 DAYS LOGGED  ·  BEST STREAK: ${Math.max(30, game.bestStreak)} DAYS  ·  NOVEMBER 30, 2026`,
      1100,
      1065
    );

    // Gold Wax Seal (Bottom Center)
    ctx.save();
    ctx.translate(1100, 1260);
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.arc(0, 0, 75, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = "#92400e";
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 65, Math.sin(a) * 65, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = "bold 15px -apple-system, sans-serif";
    ctx.fillStyle = "#78350f";
    ctx.fillText("VERIFIED", 0, -22);
    ctx.font = "800 22px -apple-system, sans-serif";
    ctx.fillText("NNN 2026", 0, 6);
    ctx.font = "bold 13px -apple-system, sans-serif";
    ctx.fillText("SURVIVOR", 0, 30);
    ctx.restore();

    // Date (Left)
    ctx.font = '20px "Times New Roman", Georgia, serif';
    ctx.fillStyle = "#475569";
    ctx.fillText("Date of Escape", 480, 1420);
    ctx.font = 'bold 24px "Times New Roman", Georgia, serif';
    ctx.fillStyle = "#0f172a";
    ctx.fillText("November 30, 2026", 480, 1375);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(320, 1400);
    ctx.lineTo(640, 1400);
    ctx.stroke();

    // Signatures (Right)
    ctx.font = '20px "Times New Roman", Georgia, serif';
    ctx.fillStyle = "#475569";
    ctx.fillText("Escape Harbor Authority", 1720, 1420);
    ctx.font = 'italic bold 28px "Times New Roman", Georgia, serif';
    ctx.fillStyle = "#086870";
    ctx.fillText("The Island Crew", 1720, 1375);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1560, 1400);
    ctx.lineTo(1880, 1400);
    ctx.stroke();

    // Trigger PNG download
    const safeName = (playerName || "Survivor").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    const link = document.createElement("a");
    link.download = `No-Nut-November-Survival-Certificate-${safeName}.png`;
    link.href = certCanvas.toDataURL("image/png");
    link.click();
  }

  function scrollToDay(day: number, smooth = true) {
    if (!stage.current || !canvas.current) return;
    const point = routePoint(day);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.current.scrollTo({
      top: (point.y / ROUTE_HEIGHT) * canvas.current.clientHeight - stage.current.clientHeight * 0.48,
      behavior: smooth && !reduced ? "smooth" : "instant",
    });
  }

  function locate() {
    setSelectedPlayerId(null);
    setSelection(null);
    setRewardSelected(false);
    setDetailsOpen(true);
    scrollToDay(nextDay);
  }

  function selectPlayer(id: string) {
    const player = crew.find(member => member.id === id);
    if (!player) return;
    setSelectedPlayerId(id);
    setRewardSelected(false);
    setDetailsOpen(true);
    scrollToDay(player.progress);
  }

  useEffect(() => {
    if (!game.ready) return;
    const frame = window.requestAnimationFrame(() =>
      scrollToDay(Math.min(30, Math.max(1, game.checkInCount + (game.checked ? 0 : 1))), false)
    );
    return () => window.cancelAnimationFrame(frame);
  }, [game.ready, game.checkInCount, game.checked]);

  useEffect(() => {
    if (!celebrating) return;
    const timeout = window.setTimeout(() => setCelebrating(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [celebrating]);

  async function logDay() {
    const didLog = await game.checkIn();
    if (!didLog) return;
    setSelection(nextDay);
    setCelebrating(true);
    if ("vibrate" in navigator && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigator.vibrate([40, 60, 80]);
    }
  }

  const stateLabel = selectedDone
    ? "Completed"
    : selectedFuture
    ? "Locked Ahead"
    : game.checked
    ? "Tomorrow's Step"
    : "Today's Escape Point";

  return (
    <section className={`escape-screen${celebrating ? " celebrating" : ""}`} aria-label="Island escape map">
      <div className="game-hud-header">
        <button className="hud-route-progress" onClick={locate} aria-label={`Escape progress: ${completed} of 30 days. Find your checkpoint`}>
          <span className="hud-progress-label">Escape progress <strong>{completed} <span>/ 30 days</span></strong></span>
          <span className="hud-progress-track" aria-hidden="true"><span className="hud-progress-fill" style={{ transform: `scaleX(${escapePercent / 100})` }} /></span>
          <LocateFixed size={17} aria-hidden="true" />
        </button>
      </div>

      {/* FLOATING 7-DAYS STREAK RIBBON (From reference image) */}
      <div className="hud-streak-ribbon">
        <div className="streak-ribbon-tag">
          <Flame size={13} fill="currentColor" />
          <span>7-DAY STREAK</span>
        </div>
        <div className="streak-ribbon-days">
          {weekDays.map((item) => (
            <div
              key={item.dateStr}
              className={`streak-day-cell ${item.isLogged ? "is-logged" : ""} ${item.isCurrent ? "is-current" : ""}`}
              title={`${item.dayLabel}: ${item.isLogged ? "Checked in" : item.isCurrent ? "Today" : "Pending"}`}
            >
              <div className="streak-day-flame-wrapper">
                {item.isLogged ? (
                  <Flame size={19} className="flame-lit animated-flame" />
                ) : item.isCurrent ? (
                  <Flame size={19} className="flame-today pulsing-flame" />
                ) : (
                  <Flame size={17} className="flame-unlit" />
                )}
              </div>
              <span className="streak-day-label">{item.dayLabel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CREW EXPEDITION BAR (If online room active) */}
      {game.ready && (game.mode === "practice" || (game.mode === "online" && !game.room.id)) && (
        <Link className="crew-map-empty" href="/crew">
          <Users size={15} aria-hidden="true" />
          <span>{game.mode === "practice" ? "Practice is solo · Bring your crew" : "Join or create a room to see your crew"}</span>
          <span aria-hidden="true">›</span>
        </Link>
      )}
      {crew.length > 0 && (
        <div className="crew-map-bar">
          <div className="crew-map-heading">
            <button
              className="crew-toggle"
              aria-expanded={crewOpen}
              onClick={() => setCrewOpen(!crewOpen)}
            >
              <Users size={14} /> Crew Status{" "}
              <b>{crew.filter(p => p.alive || p.won).length} surviving</b>
              {crewOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {crewOpen && (
              <button
                className="crew-map-refresh"
                onClick={() => void game.refresh()}
                aria-label="Refresh crew progress"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            )}
          </div>
          {crewOpen && (
            <div className="crew-map-list" aria-label="Crew list">
              {crew.map(player => (
                <button
                  key={player.id}
                  className={`crew-map-chip${selectedPlayerId === player.id ? " is-selected" : ""}${
                    !player.alive && !player.won ? " is-out" : ""
                  }${player.self ? " is-you" : ""}`}
                  onClick={() => selectPlayer(player.id)}
                >
                  <span className="crew-map-avatar">
                    <PlayerAvatar avatarId={player.avatarId} accent={player.avatarAccent} size={32} animated={false} />
                  </span>
                  <span className="crew-map-name">
                    {player.self ? "You" : player.name}
                    <small>{player.won ? "Escaped!" : player.alive ? `${player.progress}/30` : "Caught"}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MAP CANVAS AREA */}
      <div className="map-area">
        <div ref={stage} className="route-stage" aria-label="Island escape map" tabIndex={0}>
          <div ref={canvas} className="route-canvas" role="group" aria-label="Island checkpoints">
            <div className="island-art" role="img" aria-label="Tropical island map backdrop" />

            {/* Glowing Dotted Trail Points */}
            <div className="route-dots" aria-hidden="true">
              {Array.from({ length: 29 }, (_, index) =>
                [0.25, 0.5, 0.75].map(fraction => {
                  const day = index + 1 + fraction;
                  const point = routePoint(day);
                  return (
                    <span
                      key={`${index}-${fraction}`}
                      className={`route-dot${day <= completed ? " is-done" : ""}`}
                      style={{ left: `${point.x / 10}%`, top: `${(point.y / ROUTE_HEIGHT) * 100}%` }}
                    />
                  );
                })
              )}
            </div>

            {/* PLAYER AVATAR ON THE MAP (Interactive with Mascot Styling & Splash animation) */}
            <button
              className={`map-self-avatar${game.ready && !game.me.alive && !game.me.won ? " is-out" : ""}`}
              style={{
                left: `${(traveler.x - 110) / 10}%`,
                top: `${(traveler.y / ROUTE_HEIGHT) * 100}%`,
              }}
              onClick={() => router.push("/settings#avatar")}
              aria-label="Your swimmer. Tap to customize in settings"
              title="Choose your swimmer"
            >
              <div className="water-splash-wake" aria-hidden="true">
                <span className="wake-ring wake-1" />
                <span className="wake-ring wake-2" />
              </div>
              <div className="map-avatar-container">
                <PlayerAvatar size={52} animated={true} />
              </div>
              <span className="map-avatar-tag">YOU</span>
            </button>

            {/* EPSTEIN MASCOT CHASER (Frantically running behind the player!) */}
            {!game.me.won && (
              <div
                className="map-mascot"
                style={{
                  left: `${(chaser.x + 105) / 10}%`,
                  top: `${Math.min(5900, chaser.y + 115) / ROUTE_HEIGHT * 100}%`,
                }}
                role="img"
                aria-label="Epstein mascot chasing you along the shore"
              >
                <div className="mascot-warning-bubble" aria-hidden="true">
                  <span>GRRR!</span>
                </div>
                <span className="mascot-portrait mascot-hungry mascot-animated-chaser" />
                <div className="mascot-foot-dust" aria-hidden="true" />
              </div>
            )}

            {/* 30 TACTILE 3D CHECKPOINT BUTTONS (Matching Candy / Duolingo / Reference Image) */}
            {nodes.map(day => {
              const point = routePoint(day);
              const done = day <= completed;
              const current = day === nextDay;
              const isSelected = day === selectedDay && !selectedPlayer && !rewardSelected;
              const isMilestone = day === 1 || day % 5 === 0;
              const isHarbor = day === 30;
              const checkpointCrew = crewAtDay(day).filter(player => !player.self);

              return (
                <button
                  key={day}
                  className={`checkpoint-3d ${done ? "is-done" : ""} ${current ? "is-current" : ""} ${
                    isSelected ? "is-selected" : ""
                  } ${isMilestone ? "is-milestone" : ""} ${isHarbor ? "is-harbor" : ""}`}
                  style={{ left: `${point.x / 10}%`, top: `${(point.y / ROUTE_HEIGHT) * 100}%` }}
                  aria-label={`Day ${day}: ${landmarkForDay(day).name}, ${done ? "completed" : current ? "today" : "locked"}${checkpointCrew.length ? `, ${checkpointCrew.length} crew ${checkpointCrew.length === 1 ? "member" : "members"} here` : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedPlayerId(null);
                    setRewardSelected(false);
                    setSelection(day);
                    setDetailsOpen(true);
                  }}
                >
                  {/* Perched 3D Golden Crown on the Active Level (like Level 28 in reference image!) */}
                  {current && (
                    <span className="checkpoint-crown" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                        <path
                          d="M3 18h18l-2-11-4.5 5.5-2.5-8-2.5 8L5 7 3 18z"
                          fill="#facc15"
                          stroke="#ca8a04"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                        <circle cx="3" cy="7" r="1.5" fill="#fef08a" />
                        <circle cx="12" cy="4.5" r="1.5" fill="#fef08a" />
                        <circle cx="21" cy="7" r="1.5" fill="#fef08a" />
                        <rect x="4" y="18" width="16" height="2.5" rx="1" fill="#eab308" />
                      </svg>
                    </span>
                  )}

                  {/* Pulsing Beacon Ring for Current Level */}
                  {current && <span className="checkpoint-beacon" aria-hidden="true" />}

                  {/* Top-Right Badge: Green Checkmark for Done, Lock for Future */}
                  {done ? (
                    <span className="checkpoint-check-badge" aria-hidden="true">
                      <svg viewBox="0 0 16 16" width="15" height="15" fill="none">
                        <circle cx="8" cy="8" r="7.5" fill="#22c55e" stroke="#ffffff" strokeWidth="1.6" />
                        <path
                          d="M5 8.2l2 2 4-4.5"
                          stroke="#ffffff"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : !current ? (
                    <span className="checkpoint-lock-badge" aria-hidden="true">
                      <Lock size={12} strokeWidth={2.5} />
                    </span>
                  ) : null}

                  {/* Label for Current */}
                  {current && (
                    <span className="checkpoint-status-ribbon">
                      {done ? "LOGGED" : game.checked ? "NEXT" : "TODAY"}
                    </span>
                  )}

                  {/* 3D Button Face */}
                  <span className="checkpoint-3d-face">
                    <span className="checkpoint-num">{day}</span>
                  </span>
                  {checkpointCrew.length > 0 && (
                    <span className="checkpoint-crew-stack" aria-hidden="true">
                      {checkpointCrew.slice(0, 3).map(player => (
                        <span className={`checkpoint-crew-avatar${!player.alive && !player.won ? " is-out" : ""}`} key={player.id}>
                          <PlayerAvatar avatarId={player.avatarId} accent={player.avatarAccent} size={23} animated={false} />
                        </span>
                      ))}
                      {checkpointCrew.length > 3 && <span className="checkpoint-crew-more">+{checkpointCrew.length - 3}</span>}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Boss encounter gates */}
            <button
              className="boss-ambush-gate-btn boss-gate-kirkify boss-gate-tumz"
              style={{
                left: `${(routePoint(10).x - 120) / 10}%`,
                top: `${(routePoint(10).y / ROUTE_HEIGHT) * 100}%`,
              }}
              onClick={() => router.push("/boss?opponent=kirkify")}
              aria-label="Boss Gate: Kirkify (Day 10)"
              title="Boss 1: Kirkify"
            >
              <span className="boss-gate-aura" aria-hidden="true" />
              <span className="boss-gate-icon"><Swords size={20} aria-hidden="true" /></span>
              <span className="boss-gate-title">KIRKIFY</span>
            </button>

            <button
              className="boss-ambush-gate-btn boss-gate-diddy boss-gate-mabs"
              style={{
                left: `${(routePoint(20).x + 110) / 10}%`,
                top: `${(routePoint(20).y / ROUTE_HEIGHT) * 100}%`,
              }}
              onClick={() => router.push("/boss?opponent=diddy")}
              aria-label="Boss Gate: Diddy (Day 20)"
              title="Boss 2: Diddy"
            >
              <span className="boss-gate-aura" aria-hidden="true" />
              <span className="boss-gate-icon"><Zap size={20} aria-hidden="true" /></span>
              <span className="boss-gate-title">DIDDY</span>
            </button>

            <button
              className="boss-ambush-gate-btn boss-gate-epstein"
              style={{
                left: `${(routePoint(30).x - 125) / 10}%`,
                top: `${(routePoint(30).y / ROUTE_HEIGHT) * 100}%`,
              }}
              onClick={() => router.push("/boss?opponent=epstein")}
              aria-label="Boss Gate: Epstein Island Overlord (Day 30)"
              title="Final boss: Epstein (Island Overlord)"
            >
              <span className="boss-gate-aura" aria-hidden="true" />
              <span className="boss-gate-icon"><Swords size={20} aria-hidden="true" /></span>
              <span className="boss-gate-title">EPSTEIN</span>
            </button>

            {/* HARBOR ESCAPE CHEST (Day 30 Treasure) */}
            <button
              className={`treasure-chest treasure-chest-3d ${rewardUnlocked ? "is-unlocked" : "is-locked"}`}
              style={{ left: "42%", top: `${(160 / ROUTE_HEIGHT) * 100}%` }}
              aria-label={rewardUnlocked ? "Open escape reward letter" : "Reward chest, unlock at day 30"}
              onClick={() => {
                setSelectedPlayerId(null);
                setRewardSelected(true);
                setRewardOpen(false);
                setChestAnimStage("idle");
                setDetailsOpen(true);
              }}
            >
              <Archive size={26} className="chest-icon" />
              <span>REWARD</span>
              {rewardUnlocked && <span className="chest-sparkle-halo" aria-hidden="true" />}
            </button>

            {/* CELEBRATION CONFETTI & PARTICLES */}
            {celebrating && (
              <div
                className="checkin-sparks"
                aria-hidden="true"
                style={{ left: `${traveler.x / 10}%`, top: `${(traveler.y / ROUTE_HEIGHT) * 100}%` }}
              >
                {Array.from({ length: 20 }, (_, i) => (
                  <i
                    key={i}
                    style={
                      {
                        "--dx": `${Math.cos((i / 20) * Math.PI * 2) * (80 + (i % 3) * 25)}px`,
                        "--dy": `${Math.sin((i / 20) * Math.PI * 2) * (80 + (i % 3) * 25)}px`,
                        "--delay": `${i * 18}ms`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Floating Locator Button */}
        <button className="floating-locate-btn" onClick={locate} aria-label="Locate my position" title="Find my checkpoint">
          <LocateFixed size={20} />
        </button>
      </div>

      {/* BOTTOM QUESTS & ACTION DRAWER (Matching "TODAY'S QUESTS" in reference image) */}
      {!detailsOpen ? (
        <div className={`bottom-game-dock ${questsOpen ? "quests-expanded" : "quests-collapsed"}`}>
          {/* Header of the Quests Card */}
          <div className="dock-quests-header">
            <div className="dock-title-row">
              <span className="gem-icon-badge"><Diamond size={15} aria-hidden="true" /></span>
              <span className="dock-title-text">TODAY&apos;S ESCAPE QUEST</span>
            </div>
            <div className="dock-header-actions">
              <button
                className="dock-toggle-btn"
                aria-label={questsOpen ? "Collapse quests" : "Expand quests"}
                aria-expanded={questsOpen}
                onClick={() => setQuestsOpen(!questsOpen)}
              >
                {questsOpen ? <X size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
          </div>

          {/* Quests List */}
          {questsOpen && (
            <div className="dock-quests-list">
              {/* Quest 1 */}
              <div className={`quest-card ${game.checked ? "is-completed" : ""}`}>
                <div className="quest-gem-icon">
                  <span className="quest-gem"><Diamond size={18} aria-hidden="true" /></span>
                </div>
                <div className="quest-info">
                  <strong className="quest-title">{game.checked ? "Today's check-in saved" : !game.me.alive ? "Your run has ended" : game.me.won || (game.mode === "online" && game.seasonFinished) ? "The challenge has ended" : game.mode === "online" && game.isPregame ? "Get ready for November" : "Log today's check-in"}</strong>
                  <span className="quest-sub">{game.checked ? "Come back tomorrow for your next step." : !game.me.alive ? "You can still cheer on your crew." : game.me.won || (game.mode === "online" && game.seasonFinished) ? "Visit your crew to see the results." : game.mode === "online" && game.isPregame ? "Daily check-ins start November 1." : "Check in honestly before midnight to advance one day."}</span>
                </div>
                <div className="quest-reward">
                  <span className="quest-xp">{game.checked ? "DONE" : "DAILY"}</span>
                </div>
              </div>

            </div>
          )}

          {/* Primary Action Button Bar */}
          <div className="dock-actions-row">
            <button
              className="dock-details-btn"
              onClick={() => setDetailsOpen(true)}
              aria-label="View checkpoint details"
            >
              <Compass size={17} /> Details
            </button>

            {!game.me.alive && game.ready ? (
              <Link className="dock-primary-cta game-btn-3d danger" href="/crew">
                <Trophy size={18} /> Visit your crew
              </Link>
            ) : game.me.won || (game.mode === "online" && game.seasonFinished) ? (
              <Link className="dock-primary-cta game-btn-3d gold" href="/crew">
                <Trophy size={18} /> {game.me.won ? "You Escaped! Celebrate" : "View crew results"}
              </Link>
            ) : game.checked ? (
              <Link className="dock-primary-cta game-btn-3d success" href="/streak">
                <Check size={20} strokeWidth={3} /> Day {completed} Logged · View Streak
              </Link>
            ) : game.mode === "online" && game.isPregame ? (
              <Link className="dock-primary-cta game-btn-3d" href="/crew">
                <Flag size={18} /> Gather Your Crew
              </Link>
            ) : (
              <button
                className="dock-primary-cta game-btn-3d primary-cta-pulse"
                disabled={game.busy || !game.ready}
                onClick={() => void logDay()}
              >
                {game.busy ? <span className="button-spinner" /> : <Flame size={20} fill="currentColor" />}
                <span>{game.busy ? "Saving Progress…" : game.ready ? "I'M STILL IN — CHECK IN" : "Loading…"}</span>
              </button>
            )}
          </div>
        </div>
      ) : rewardSelected ? (
        /* DAY 30 REWARD CHEST OPENING EXPERIENCE */
        <div className="checkpoint-detail-card reward-detail" aria-live="polite">
          <div className="reward-stage-header">
            <h2>{rewardOpen ? "Your Escape Letter & Photos" : "The Escape Boat Chest"}</h2>
            <button
              type="button"
              className="hide-detail-btn hide-map-detail"
              onClick={() => setDetailsOpen(false)}
              aria-label="Close details"
            >
              <X size={20} />
            </button>
          </div>

          <div className="chest-opening-arena">
            {/* Volumetric god rays when opening / opened */}
            {(chestAnimStage === "opening" || chestAnimStage === "opened") && (
              <div className="chest-god-rays-emitter" aria-hidden="true">
                <div className="chest-god-rays" />
                <div className="chest-god-glow" />
              </div>
            )}

            {/* 3D Chest Model Scene */}
            <div className="chest-scene-viewport">
              <div
                className={`interactive-3d-chest ${rewardUnlocked ? "is-unlocked" : "is-locked"} is-${chestAnimStage}`}
                onClick={rewardUnlocked && chestAnimStage === "idle" ? handleOpenChest : undefined}
                role={rewardUnlocked && chestAnimStage === "idle" ? "button" : undefined}
                tabIndex={rewardUnlocked && chestAnimStage === "idle" ? 0 : undefined}
                aria-label={rewardUnlocked ? "Interactive treasure chest - click to open" : "Locked treasure chest"}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && rewardUnlocked && chestAnimStage === "idle") {
                    handleOpenChest();
                  }
                }}
              >
                {/* 3D Hinged Lid Assembly */}
                <div className="chest-lid-assembly">
                  <div className="chest-lid-top">
                    <div className="chest-lid-slats" />
                    <div className="chest-lid-band band-left" />
                    <div className="chest-lid-band band-center" />
                    <div className="chest-lid-band band-right" />
                  </div>
                  <div className="chest-lid-rim">
                    <div className="chest-lid-latch">
                      <div className="chest-latch-ring" />
                    </div>
                  </div>
                </div>

                {/* Chest Interior Glow & Cavity */}
                <div className="chest-interior-cavity">
                  <div className="chest-gold-pile" />
                  <div className="chest-interior-beam" />
                </div>

                {/* Chest Body Base */}
                <div className="chest-body-box">
                  <div className="chest-wood-grain" />
                  <div className="chest-corner-bracket bracket-tl" />
                  <div className="chest-corner-bracket bracket-tr" />
                  <div className="chest-corner-bracket bracket-bl" />
                  <div className="chest-corner-bracket bracket-br" />
                  <div className="chest-body-band band-left" />
                  <div className="chest-body-band band-right" />

                  {/* Lock Plate */}
                  <div className="chest-lock-plate">
                    {rewardUnlocked ? (
                      <span className="chest-lock-glow"><Sparkles size={14} aria-hidden="true" /></span>
                    ) : (
                      <Lock size={16} className="chest-lock-icon" />
                    )}
                  </div>
                </div>
              </div>

              {/* Pedestal / Shadow underneath */}
              <div className="chest-pedestal-shadow" aria-hidden="true" />
            </div>

            {/* Sparkles / Ember particles */}
            {rewardUnlocked && (
              <div className="chest-ambient-particles" aria-hidden="true">
                <span className="particle-sparkle p1">✦</span>
                <span className="particle-sparkle p2">✦</span>
                <span className="particle-sparkle p3">✦</span>
                <span className="particle-sparkle p4">✦</span>
              </div>
            )}
          </div>

          {!rewardOpen && (
            <div className="chest-status-callout">
              <p className="detail-body-text">
                {rewardUnlocked
                  ? "You reached the end of the escape route! Open your letter and photos inside."
                  : "Complete 30 days to escape the island and unlock the harbor reward."}
              </p>

              {rewardUnlocked && (
                <button
                  type="button"
                  className="primary-button game-btn-3d reward-open"
                  onClick={handleOpenChest}
                >
                  <MailOpen size={18} />
                  <span>Open Chest & Reveal Keepsake</span>
                  <Gift size={18} />
                </button>
              )}
            </div>
          )}

          {rewardOpen && rewardUnlocked && (
            <div className={`chest-loot-reveal ${chestAnimStage === "opened" ? "is-ready" : "is-emerging"}`}>
              {/* INSTAX PHOTO (Pure picture, zero details, authentic Instax paper) */}
              <div className="instax-film-container">
                <div
                  className="instax-frame"
                  onClick={() => setActivePhotoIdx((prev) => (prev < REWARD_PHOTOS.length - 1 ? prev + 1 : 0))}
                  role="button"
                  tabIndex={0}
                  aria-label="Instax photo keepsake - tap to flip between photos"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setActivePhotoIdx((prev) => (prev < REWARD_PHOTOS.length - 1 ? prev + 1 : 0));
                    }
                  }}
                >
                  <div className="instax-photo-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={REWARD_PHOTOS[activePhotoIdx].src}
                      alt={REWARD_PHOTOS[activePhotoIdx].alt}
                      className="instax-image"
                    />
                    <button
                      type="button"
                      className="instax-zoom-pill"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLightboxPhoto(REWARD_PHOTOS[activePhotoIdx].src);
                      }}
                      aria-label="View photo full size"
                    >
                      <Maximize2 size={12} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Instax classic bottom chin */}
                  <div className="instax-chin">
                    <span className="instax-chin-marker">Island Escape · Nov &apos;26</span>
                    <div className="instax-photo-dots" role="tablist" aria-label="Instax photo selection">
                      {REWARD_PHOTOS.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          role="tab"
                          aria-selected={activePhotoIdx === idx}
                          className={`instax-dot ${activePhotoIdx === idx ? "active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePhotoIdx(idx);
                          }}
                          aria-label={`Photo ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* DOWNLOADABLE SURVIVAL CERTIFICATE */}
              <div className="reward-letter-box reward-letter survivor-certificate-card">
                <div className="certificate-ornate-border">
                  <span className="cert-corner cert-corner-tl" aria-hidden="true" />
                  <span className="cert-corner cert-corner-tr" aria-hidden="true" />
                  <span className="cert-corner cert-corner-bl" aria-hidden="true" />
                  <span className="cert-corner cert-corner-br" aria-hidden="true" />

                  <div className="certificate-header">
                    <Trophy size={28} className="certificate-medal-badge" aria-hidden="true" />
                    <h3 className="certificate-heading">CERTIFICATE OF SURVIVAL</h3>
                    <span className="certificate-subtitle">NO NUT NOVEMBER 2026 · ISLAND ESCAPE</span>
                  </div>

                  <div className="certificate-divider" aria-hidden="true" />

                  <p className="certificate-present-line">This officially certifies that</p>

                  <div className="certificate-name-row">
                    <input
                      type="text"
                      className="certificate-name-input"
                      value={playerName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      aria-label="Name on certificate"
                      placeholder="Your Name"
                      maxLength={32}
                    />
                  </div>

                  <p className="certificate-citation">
                    has demonstrated extraordinary willpower, discipline, and honesty by conquering Thirty days of the November challenge and escaping the island undefeated.
                  </p>

                  {/* 3-Column Official Landscape Certificate Footer */}
                  <div className="certificate-stats-footer">
                    <div className="certificate-meta-item cert-col-left">
                      <div className="cert-sig-line" aria-hidden="true" />
                      <span className="cert-meta-label">DATE OF ESCAPE</span>
                      <strong className="cert-meta-val">Nov 30, 2026</strong>
                      <span className="cert-meta-sub">{completed} days logged</span>
                    </div>

                    <div className="certificate-gold-seal" aria-hidden="true">
                      <span>★ 30 DAYS ★</span>
                      <strong>SURVIVOR</strong>
                      <small>NNN 2026</small>
                    </div>

                    <div className="certificate-meta-item cert-col-right">
                      <div className="cert-sig-line" aria-hidden="true" />
                      <span className="cert-meta-label">AUTHORITY</span>
                      <strong className="cert-meta-val">The Island Crew</strong>
                      <span className="cert-meta-sub">Best streak: {game.bestStreak} days</span>
                    </div>
                  </div>

                  <div className="certificate-links-row">
                    <Link className="cert-streak-link" href="/streak">
                      View your streak and milestones →
                    </Link>
                  </div>
                </div>

                <button
                  type="button"
                  className="certificate-download-btn game-btn-3d"
                  onClick={downloadCertificate}
                >
                  <Download size={18} />
                  <span>Download Official Certificate (PNG)</span>
                  <span className="cert-dim-badge">Standard Landscape · 11×8.5″</span>
                </button>
              </div>

              {/* Action Toolbar */}
              <div className="chest-reveal-actions">
                <button
                  type="button"
                  className="chest-replay-btn game-btn-3d"
                  onClick={handleReplayChest}
                >
                  <RefreshCw size={15} /> Replay Chest Opening
                </button>
              </div>
            </div>
          )}

          <button className="secondary-button hide-map-detail" onClick={() => setDetailsOpen(false)}>
            Back to Island Map
          </button>
        </div>
      ) : selectedPlayer ? (
        /* CREW PLAYER DETAIL DRAWER */
        <div className="checkpoint-detail-card player-detail" aria-live="polite">
          <button className="hide-detail-btn" onClick={() => setDetailsOpen(false)} aria-label="Close details">
            <X size={18} />
          </button>
          <div className="detail-header-row">
            <div className="detail-avatar-box">
              <PlayerAvatar avatarId={selectedPlayer.avatarId} accent={selectedPlayer.avatarAccent} size={46} animated={false} />
            </div>
            <div>
              <span className="step-tag-pill">{selectedPlayer.self ? "YOUR EXPLORER" : "CREW MEMBER"}</span>
              <h2>{selectedPlayer.self ? "You" : selectedPlayer.name}</h2>
            </div>
            <span className="detail-progress-badge">
              {selectedPlayer.progress}
              <small>/30</small>
            </span>
          </div>
          <div className="detail-meta-tags">
            <span className={`status-pill ${!selectedPlayer.alive && !selectedPlayer.won ? "is-eliminated" : "is-active"}`}>
              {selectedPlayer.won
                ? "Escaped the Island!"
                : selectedPlayer.alive
                ? selectedPlayer.checkedIn
                  ? "Checked In Today"
                  : "Still in the Run"
                : "Caught by Epstein"}
            </span>
            <span className="distance-pill">
              {selectedPlayer.self
                ? "Your current saved spot"
                : selectedPlayer.progress === completed
                ? "Right beside you"
                : selectedPlayer.progress < completed
                ? `${completed - selectedPlayer.progress} days behind`
                : `${selectedPlayer.progress - completed} days ahead`}
            </span>
          </div>
          <div className="detail-actions-row">
            <button className="primary-button game-btn-3d" onClick={() => { setSelectedPlayerId(null); setSelection(null); locate(); }}>
              <LocateFixed size={18} /> Focus My Location
            </button>
            <Link className="secondary-button" href="/crew">
              View Crew
            </Link>
          </div>
        </div>
      ) : (
        /* CHECKPOINT DETAIL DRAWER */
        <div className={`checkpoint-detail-card ${selectedDone ? "is-complete" : ""}`} aria-live="polite">
          <button className="hide-detail-btn" onClick={() => setDetailsOpen(false)} aria-label="Close details">
            <X size={18} />
          </button>
          <div className="detail-header-row">
            <span
              className={`mascot-portrait mascot-map-badge ${
                !game.me.alive ? "mascot-hungry" : game.checked || celebrating ? "mascot-worried" : "mascot-neutral"
              }`}
              role="img"
              aria-label="Island mascot"
            />
            <div>
              <span className="step-tag-pill">Day {selectedDay} · {stateLabel}</span>
              <h2>{celebrating ? "One day closer to the escape boat!" : selected.name}</h2>
            </div>
            <span className="detail-progress-badge">
              {completed}
              <small>/30</small>
            </span>
          </div>
          <p className="detail-body-text">
            {celebrating
              ? "Your honest check-in is saved! The next step unlocks tomorrow."
              : selectedDone
              ? `You cleared this section of the island by checking in honestly.`
              : selectedFuture
              ? `${selected.description} Reach this milestone after ${selectedDay} total daily check-ins.`
              : selected.description}
          </p>

          {game.ready && (
            <div className="checkpoint-crew-details">
              <h3>Crew at this checkpoint</h3>
              {game.mode === "practice" ? (
                <p>Practice is solo. <Link href="/crew">Set up or join a crew</Link> to see friends on the map.</p>
              ) : !game.room.id ? (
                <p>You&apos;re not in a room yet. <Link href="/crew">Create or join a room</Link> to see your crew here.</p>
              ) : selectedCrew.length ? (
                <ul>
                  {selectedCrew.map(player => (
                    <li key={player.id}>
                      <PlayerAvatar avatarId={player.avatarId} accent={player.avatarAccent} size={30} animated={false} />
                      <span><strong>{player.self ? "You" : player.name}</strong><small>{player.won ? "Escaped" : !player.alive ? "Out of the run" : player.progress === 0 ? "Still in · Waiting at the start" : player.checkedIn ? "Still in · Checked in today" : "Still in · Check-in pending"}</small></span>
                    </li>
                  ))}
                </ul>
              ) : <p>No crew members at this checkpoint yet. <Link href="/crew">View your crew</Link></p>}
            </div>
          )}

          <div className="detail-actions-row">
            {!game.me.alive || game.me.won || (game.seasonFinished && game.mode === "online") ? (
              <Link className="primary-button game-btn-3d" href="/crew">
                <Trophy size={18} /> {game.me.won ? "Celebrate With Crew" : "Visit Crew"}
              </Link>
            ) : game.mode === "online" && game.isPregame ? (
              <Link className="primary-button game-btn-3d" href="/crew"><Flag size={18} /> Gather Your Crew</Link>
            ) : selectedFuture || (selectedDone && !game.checked) ? (
              <button className="primary-button game-btn-3d" onClick={() => { setSelection(null); locate(); }}>
                <LocateFixed size={18} /> Back to Today&apos;s Step
              </button>
            ) : game.checked ? (
              <Link className="primary-button game-btn-3d success" href="/streak">
                <Check size={19} strokeWidth={3} /> Day Logged · View Streak
              </Link>
            ) : (
              <button
                className="primary-button game-btn-3d primary-cta-pulse"
                disabled={game.busy || !game.ready}
                onClick={() => void logDay()}
              >
                {game.busy ? <span className="button-spinner" /> : <Flame size={19} fill="currentColor" />}
                <span>{game.busy ? "Saving Progress…" : game.ready ? "I'M STILL IN — CHECK IN" : "Loading…"}</span>
              </button>
            )}
          </div>

          <div className="daily-deadline-bar">
            <span>
              <Clock3 size={13} />
              {game.mode === "practice"
                ? "1 check-in per day (local time)"
                : `Midnight cutoff · ${game.timezone.split("/").pop()?.replaceAll("_", " ")}`}
            </span>
            <Link href="/report">Report a slip honestly</Link>
          </div>
        </div>
      )}

      {lightboxPhoto && (
        <div
          className="reward-lightbox-backdrop"
          onClick={() => setLightboxPhoto(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged keepsake photo"
        >
          <div className="reward-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="reward-lightbox-close"
              onClick={() => setLightboxPhoto(null)}
              aria-label="Close enlarged photo"
            >
              <X size={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxPhoto} alt="Enlarged commemorative photo" className="reward-lightbox-img" />
          </div>
        </div>
      )}
    </section>
  );
}
