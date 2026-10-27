"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  Compass,
  Diamond,
  Flag,
  Flame,
  Footprints,
  Lock,
  LocateFixed,
  MailOpen,
  RefreshCw,
  Sparkles,
  Trophy,
  Swords,
  UserRound,
  Users,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { landmarkForDay, ROUTE_HEIGHT, routePoint } from "../lib/escape-route";
import { useGame } from "./game-provider";
import { PlayerAvatar } from "./avatar";

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

  const groups = new Map<number, typeof crew>();
  for (const player of crew.filter(player => !player.self)) {
    const progress = Math.max(0, Math.min(30, player.progress));
    groups.set(progress, [...(groups.get(progress) || []), player]);
  }

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

  const xpEarned = completed * 100 + game.streak * 25;
  const escapePercent = Math.min(100, Math.round((completed / 30) * 100));

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
    <section className={`escape-screen${celebrating ? " celebrating" : ""}`} aria-labelledby="escape-title">
      {/* GAMIFIED TOP HUD HEADER (Matching reference image) */}
      <div className="game-hud-header">
        <div className="hud-level-badge" title={`Escape Progress: ${completed} of 30 days`}>
          <div className="hud-shield-icon">
            <span className="hud-shield-num">{completed}</span>
          </div>
          <div className="hud-level-info">
            <span className="hud-level-pct">{escapePercent}%</span>
            <div className="hud-progress-track">
              <div className="hud-progress-fill" style={{ transform: `scaleX(${Math.max(0.06, escapePercent / 100)})` }} />
            </div>
          </div>
        </div>

        <div className="hud-title-banner">
          <h1 id="escape-title" className="hud-main-title">
            THE ESCAPE
          </h1>
          <span className="hud-subtitle">
            {game.mode === "online" ? game.room.name : "Practice Island"}
          </span>
        </div>

        <div className="hud-resources">
          {/* XP Pill */}
          <div className="hud-resource-pill xp-pill" title={`${xpEarned} Escape XP`}>
            <Zap size={14} className="xp-bolt" />
            <span>{xpEarned}</span>
          </div>

          {/* Daily Streak Pill */}
          <Link href="/streak" className="hud-resource-pill streak-pill" title={`${game.streak} Day Streak`}>
            <Flame size={15} className="streak-flame" />
            <span>{game.streak}</span>
          </Link>

          {/* Quick Avatar Studio Button */}
          <button
            className="hud-avatar-btn"
            onClick={() => router.push("/settings#avatar")}
            aria-label="Customize your swimmer"
            title="Choose your swimmer"
          >
            <PlayerAvatar size={34} animated={false} />
            <span className="hud-edit-dot"><Wand2 size={9} /></span>
          </button>

          {/* Account Profile Button */}
          <Link href="/account" className="hud-account-btn" aria-label="Account profile" title="Account profile">
            <UserRound size={16} />
          </Link>
        </div>
      </div>

      {/* FLOATING 7-DAYS STREAK RIBBON (From reference image) */}
      <div className="hud-streak-ribbon">
        <div className="streak-ribbon-tag">
          <Flame size={13} fill="currentColor" />
          <span>7-DAY STREAK</span>
        </div>
        <div className="streak-ribbon-days">
          {weekDays.map((item, idx) => (
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

              return (
                <button
                  key={day}
                  className={`checkpoint-3d ${done ? "is-done" : ""} ${current ? "is-current" : ""} ${
                    isSelected ? "is-selected" : ""
                  } ${isMilestone ? "is-milestone" : ""} ${isHarbor ? "is-harbor" : ""}`}
                  style={{ left: `${point.x / 10}%`, top: `${(point.y / ROUTE_HEIGHT) * 100}%` }}
                  aria-label={`Day ${day}: ${landmarkForDay(day).name}, ${done ? "completed" : current ? "today" : "locked"}`}
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
              className={`treasure-chest-3d ${rewardUnlocked ? "is-unlocked" : "is-locked"}`}
              style={{ left: "42%", top: `${(160 / ROUTE_HEIGHT) * 100}%` }}
              aria-label={rewardUnlocked ? "Open escape reward letter" : "Reward chest, unlock at day 30"}
              onClick={() => {
                setSelectedPlayerId(null);
                setRewardSelected(true);
                setRewardOpen(false);
                setDetailsOpen(true);
              }}
            >
              <Archive size={26} className="chest-icon" />
              <span>REWARD</span>
              {rewardUnlocked && <span className="chest-sparkle-halo" aria-hidden="true" />}
            </button>

            {/* OTHER CREW MEMBERS ON THE MAP */}
            {[...groups.entries()].map(([progress, members]) => {
              const point = routePoint(progress);
              const member = members.find(player => player.id === selectedPlayerId) || members[0];
              const anyAlive = members.some(player => player.alive || player.won);
              return (
                <button
                  key={members[0].id}
                  className={`map-crew-marker${
                    members.some(player => player.id === selectedPlayerId) ? " is-selected" : ""
                  }${anyAlive ? " has-survivors" : " all-out"}`}
                  style={{ left: `${point.x / 10}%`, top: `${(point.y / ROUTE_HEIGHT) * 100}%` }}
                  aria-label={`${members.length > 1 ? `${members.length} players` : member.name} at ${progress} of 30 days`}
                  onClick={() => selectPlayer(member.id)}
                >
                  <span className="map-crew-avatar">
                    <PlayerAvatar avatarId={member.avatarId} accent={member.avatarAccent} size={36} animated={false} />
                  </span>
                  {members.length > 1 && <span className="map-crew-count">+{members.length - 1}</span>}
                </button>
              );
            })}

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
          <div className="dock-quests-header" onClick={() => setQuestsOpen(!questsOpen)}>
            <div className="dock-title-row">
              <span className="gem-icon-badge"><Diamond size={15} aria-hidden="true" /></span>
              <span className="dock-title-text">TODAY&apos;S ESCAPE QUESTS</span>
            </div>
            <div className="dock-header-actions">
              <button
                className="dock-toggle-btn"
                aria-label={questsOpen ? "Collapse quests" : "Expand quests"}
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
                  <strong className="quest-title">Log Today&apos;s Check-in</strong>
                  <span className="quest-sub">Escape Epstein before midnight</span>
                </div>
                <div className="quest-reward">
                  <span className="quest-xp">+100 XP</span>
                  <span className="quest-streak"><Flame size={12} aria-hidden="true" /> +1 Day</span>
                </div>
              </div>

              {/* Quest 2 */}
              <div className="quest-card">
                <div className="quest-gem-icon">
                  <span className="quest-gem"><Footprints size={18} aria-hidden="true" /></span>
                </div>
                <div className="quest-info">
                  <strong className="quest-title">Stay 2 Days Ahead</strong>
                  <span className="quest-sub">Epstein is 2 days behind you</span>
                </div>
                <div className="quest-reward">
                  <span className="quest-xp">+50 XP</span>
                  <span className="quest-streak">Safe</span>
                </div>
              </div>

              {/* Quest 3: 3-Boss Contra Raids */}
              <div
                className="quest-card boss-quest-card"
                onClick={() => router.push("/boss?opponent=kirkify")}
                style={{ cursor: "pointer" }}
                title="Open the solo Kirkify encounter"
              >
                <div className="quest-gem-icon boss-gem-icon">
                  <Swords size={17} className="boss-swords-icon" />
                </div>
                <div className="quest-info">
                  <strong className="quest-title">Face Kirkify</strong>
                  <span className="quest-sub">Solo practice · Dodge and attack for 3 minutes</span>
                </div>
                <div className="quest-reward">
                  <span className="quest-xp">PLAY</span>
                  <span className="quest-streak">3:00</span>
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
            ) : game.me.won ? (
              <Link className="dock-primary-cta game-btn-3d gold" href="/crew">
                <Trophy size={18} /> You Escaped! Celebrate
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
        /* DAY 30 REWARD DRAWER */
        <div className="checkpoint-detail-card reward-detail" aria-live="polite">
          <button className="hide-detail-btn" onClick={() => setDetailsOpen(false)} aria-label="Close details">
            <X size={18} />
          </button>
          <div className="detail-header-row">
            <span className="detail-avatar-box reward-box">
              <Archive size={26} />
            </span>
            <div>
              <span className="step-tag-pill">DAY 30 ESCAPE HARBOR</span>
              <h2>{rewardOpen ? "Your Escape Letter" : "The Escape Boat Chest"}</h2>
            </div>
          </div>
          {rewardOpen && rewardUnlocked ? (
            <div className="reward-letter-box">
              <p><b>To the escapee who made it:</b></p>
              <p>
                Thirty consecutive days. You outpaced the chaser, showed up with honesty, and reached the boat on the
                horizon. The island is behind you.
              </p>
              <p>With admiration from the entire crew.</p>

              <p>Your run: {completed} days logged · Best streak: {game.bestStreak} days.</p>
              <Link className="text-link" href="/streak">View your streak and milestones</Link>
            </div>
          ) : (
            <p className="detail-body-text">
              {rewardUnlocked
                ? "You reached the end of the escape route! Open your letter inside."
                : "Check in for 30 consecutive days to escape the island and unlock the harbor reward."}
            </p>
          )}
          {rewardUnlocked && !rewardOpen && (
            <button className="primary-button game-btn-3d" onClick={() => setRewardOpen(true)}>
              <MailOpen size={18} /> Open Your Letter
            </button>
          )}
          <button className="secondary-button" onClick={() => setDetailsOpen(false)}>
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

          <div className="detail-actions-row">
            {!game.me.alive || game.me.won || (game.seasonFinished && game.mode === "online") ? (
              <Link className="primary-button game-btn-3d" href="/crew">
                <Trophy size={18} /> {game.me.won ? "Celebrate With Crew" : "Visit Crew"}
              </Link>
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

    </section>
  );
}
