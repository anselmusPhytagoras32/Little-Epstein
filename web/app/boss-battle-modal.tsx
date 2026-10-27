"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Award,
  Check,
  ChevronRight,
  Flame,
  Heart,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  loadBossBattleState,
  saveBossBattleState,
  getRequiredCrewCount,
  BOSS_CONFIGS,
  BOSS_LIST,
  type BossBattleState,
  type BossConfig,
  type BossId,
  type BossRaidParticipant,
} from "../lib/boss-battle";
import { PlayerAvatar } from "./avatar";
import { ContraBossArena } from "./contra-boss-arena";
import { useGame } from "./game-provider";
import type { GamePlayer } from "./game-types";

interface BossBattleModalProps {
  open: boolean;
  onClose: () => void;
  initialBossId?: BossId;
  onProgressLoss?: (days: number) => void;
  onRestoreProgress?: (days: number) => void;
}

const PRACTICE_COMPANIONS: GamePlayer[] = [
  { id: "comp-1", name: "Kai", avatar: "K", avatarId: "sky", avatarAccent: "sea", alive: true, checkedIn: true, streak: 3, progress: 3, self: false },
  { id: "comp-2", name: "Maya", avatar: "M", avatarId: "coral", avatarAccent: "coral", alive: true, checkedIn: true, streak: 4, progress: 4, self: false },
  { id: "comp-3", name: "Leo", avatar: "L", avatarId: "sun", avatarAccent: "sun", alive: true, checkedIn: true, streak: 2, progress: 2, self: false },
  { id: "comp-4", name: "Zara", avatar: "Z", avatarId: "fern", avatarAccent: "leaf", alive: true, checkedIn: true, streak: 5, progress: 5, self: false },
];

export function BossBattleModal({
  open,
  onClose,
  initialBossId = "tumz",
  onProgressLoss,
  onRestoreProgress,
}: BossBattleModalProps) {
  const game = useGame();
  const [battleState, setBattleState] = useState<BossBattleState>(loadBossBattleState);
  const [selectedBossId, setSelectedBossId] = useState<BossId>(initialBossId);
  const [viewMode, setViewMode] = useState<"arena" | "victory" | "defeat">("arena");
  const [reviving, setReviving] = useState(false);
  const [reviveSuccess, setReviveSuccess] = useState(false);
  const [reviveTrigger, setReviveTrigger] = useState(0);

  // Sync state when opened
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => {
      const loaded = loadBossBattleState();
      setBattleState(loaded);
      setSelectedBossId(initialBossId || loaded.currentBossId || "tumz");
      // If already defeated, default to victory/reward view, otherwise arena
      if (loaded.defeated[initialBossId || loaded.currentBossId || "tumz"]) {
        setViewMode("victory");
      } else {
        setViewMode("arena");
      }
      setReviving(false);
      setReviveSuccess(false);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [open, initialBossId]);

  if (!open) return null;

  const currentBossConfig: BossConfig = BOSS_CONFIGS[selectedBossId];

  // Determine active crew members
  const activeCrew: GamePlayer[] =
    game.mode === "online" && game.players.length > 0
      ? game.players
      : [game.me, ...PRACTICE_COMPANIONS];

  const totalCrewCount = Math.max(1, activeCrew.length);
  const requiredCrewCount = getRequiredCrewCount(totalCrewCount);

  // Participants who have rallied
  const currentParticipants = battleState.participants;
  const participationRate = Math.min(
    100,
    Math.round((currentParticipants.length / totalCrewCount) * 100)
  );
  const hasMetThreshold = currentParticipants.length >= requiredCrewCount;

  // Handle switching boss tab
  function handleSelectBoss(bossId: BossId) {
    setSelectedBossId(bossId);
    if (battleState.defeated[bossId]) {
      setViewMode("victory");
    } else {
      setViewMode("arena");
    }
  }

  // Handle companion recruitment (rally)
  function handleRallyCompanion() {
    const unjoined = activeCrew.filter(
      (c) => !currentParticipants.some((p) => p.id === c.id)
    );
    if (unjoined.length === 0) return;

    const recruit = unjoined[0];
    const newParticipant: BossRaidParticipant = {
      id: recruit.id,
      name: recruit.name,
      avatarId: recruit.avatarId,
      avatarAccent: recruit.avatarAccent,
      damage: 25,
      timestamp: Date.now(),
    };
    const updatedParticipants = [...currentParticipants, newParticipant];

    const nextState: BossBattleState = {
      ...battleState,
      participants: updatedParticipants,
    };

    setBattleState(nextState);
    saveBossBattleState(nextState);
  }

  // Handle player victory in Contra Arena
  function handleArenaVictory() {
    const nextDefeated = {
      ...battleState.defeated,
      [selectedBossId]: true,
    };
    const nextHp = {
      ...battleState.bossHp,
      [selectedBossId]: 0,
    };

    const nextState: BossBattleState = {
      ...battleState,
      defeated: nextDefeated,
      bossHp: nextHp,
      progressLost: 0,
    };

    setBattleState(nextState);
    saveBossBattleState(nextState);
    setViewMode("victory");
  }

  // Handle player defeat in Contra Arena
  function handleArenaDefeat() {
    const nextState: BossBattleState = {
      ...battleState,
      progressLost: 1,
      reviveAvailable: true,
    };

    setBattleState(nextState);
    saveBossBattleState(nextState);
    if (onProgressLoss) onProgressLoss(1);
    setViewMode("defeat");
  }

  // Handle Revive Activation
  function handleActivateRevive() {
    setReviving(true);
    setTimeout(() => {
      if (onRestoreProgress) {
        onRestoreProgress(battleState.progressLost || 1);
      }

      const nextHp = {
        ...battleState.bossHp,
        [selectedBossId]: currentBossConfig.maxHp,
      };

      const nextState: BossBattleState = {
        ...battleState,
        bossHp: nextHp,
        progressLost: 0,
        reviveAvailable: false,
      };

      setBattleState(nextState);
      saveBossBattleState(nextState);
      setReviving(false);
      setReviveSuccess(true);
      setReviveTrigger((prev) => prev + 1);

      setTimeout(() => {
        setReviveSuccess(false);
        setViewMode("arena");
      }, 700);
    }, 900);
  }

  // Handle Replaying the current boss
  function handleReplayArena() {
    const nextDefeated = {
      ...battleState.defeated,
      [selectedBossId]: false,
    };
    const nextHp = {
      ...battleState.bossHp,
      [selectedBossId]: currentBossConfig.maxHp,
    };

    const nextState: BossBattleState = {
      ...battleState,
      defeated: nextDefeated,
      bossHp: nextHp,
    };

    setBattleState(nextState);
    saveBossBattleState(nextState);
    setReviveTrigger((prev) => prev + 1);
    setViewMode("arena");
  }

  // Find next boss if available
  const currentIndex = BOSS_LIST.indexOf(selectedBossId);
  const nextBossId = currentIndex < BOSS_LIST.length - 1 ? BOSS_LIST[currentIndex + 1] : null;

  return (
    <div
      className="avatar-studio-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="boss-title"
    >
      <div className="boss-modal-panel contra-modal-frame" onClick={(e) => e.stopPropagation()}>
        {/* Header with Title and Close */}
        <div className="boss-modal-header">
          <div className="boss-header-title-box">
            <span className="boss-header-badge">
              <Swords size={20} />
            </span>
            <div>
              <h2 id="boss-title">Island Boss Raids · Contra Arcade</h2>
              <p>Run, Dodge &amp; Shoot with Your Crew · 30% Crew Required</p>
            </div>
          </div>
          <button
            className="studio-close-button"
            onClick={onClose}
            aria-label="Close boss battle"
          >
            <X size={18} />
          </button>
        </div>

        {/* 3 BOSS SELECTION TABS */}
        <div className="boss-tab-selector" role="tablist" aria-label="Select Boss Fight">
          {BOSS_LIST.map((bId) => {
            const config = BOSS_CONFIGS[bId];
            const isDefeated = battleState.defeated[bId];
            const isSelected = selectedBossId === bId;

            return (
              <button
                key={bId}
                role="tab"
                aria-selected={isSelected}
                className={`boss-tab-btn ${isSelected ? "is-active" : ""} ${
                  isDefeated ? "is-cleared" : ""
                }`}
                onClick={() => handleSelectBoss(bId)}
              >
                <span className="boss-tab-icon">{config.placeholderIcon}</span>
                <div className="boss-tab-info">
                  <strong className="boss-tab-name">{config.name}</strong>
                  <span className="boss-tab-day">Day {config.day}</span>
                </div>
                {isDefeated ? (
                  <span className="boss-cleared-tag">CLEARED</span>
                ) : (
                  <span className="boss-tab-threat">HP {config.maxHp}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Boss Profile Summary Bar */}
        <div className="boss-summary-strip">
          <div className="boss-meta-group">
            <span className="boss-badge-pill" style={{ background: currentBossConfig.themeColor }}>
              {currentBossConfig.placeholderIcon} {currentBossConfig.name} · {currentBossConfig.title}
            </span>
            <span className="boss-hazard-pill">
              Hazard: {currentBossConfig.projectileType === "coconuts"
                ? "Bouncing Coconuts"
                : currentBossConfig.projectileType === "lasers"
                ? "Triple Laser Barrage"
                : "Money Bomb Barrage"}
            </span>
          </div>
          <span className="boss-mascot-status-pill">
            Mascot placeholder active (drop {currentBossConfig.customImagePath} anytime)
          </span>
        </div>

        {/* Crew Threshold & Rally Row */}
        <div className="boss-crew-rally-strip">
          <div className="crew-rally-summary">
            <Users size={15} />
            <span>
              Crew: <b>{currentParticipants.length}</b>/{totalCrewCount} ({participationRate}%)
            </span>
            <span className={`rally-threshold-tag ${hasMetThreshold ? "is-met" : "is-warning"}`}>
              {hasMetThreshold
                ? "30% Threshold Met · Full Blaster Power!"
                : `Need ${requiredCrewCount} Allies (≥30%) for Shield Break`}
            </span>
          </div>

          <div className="crew-rally-roster">
            {currentParticipants.map((p) => (
              <div key={p.id} className="crew-mini-badge" title={`${p.name} joined raid`}>
                <PlayerAvatar avatarId={p.avatarId} accent={p.avatarAccent} size={24} animated={false} />
                <span>{p.name}</span>
              </div>
            ))}
            {currentParticipants.length < totalCrewCount && (
              <button
                className="rally-companion-btn"
                onClick={handleRallyCompanion}
                title="Rally another crew companion to boost firepower"
              >
                <Users size={12} /> + Rally Ally
              </button>
            )}
          </div>
        </div>

        {/* CONTENT SWITCHER: ARENA, VICTORY, or DEFEAT */}
        <div className="boss-modal-body">
          {viewMode === "victory" ? (
            /* ================= VICTORY & REWARD VIDEO ================= */
            <div className="boss-victory-view">
              <div className="victory-banner">
                <Award size={40} className="victory-trophy-icon" />
                <h3>{currentBossConfig.name.toUpperCase()} DEFEATED!</h3>
                <p>
                  You cleared the {currentBossConfig.title} encounter.
                </p>
              </div>

              <section className="surface stack boss-result-summary" aria-label="Boss progress">
                <h4>Boss progress</h4>
                <p>{BOSS_LIST.filter((id) => battleState.defeated[id]).length} of {BOSS_LIST.length} encounters cleared in your local boss progress.</p>
                <p>Your daily check-ins are part of your separate island run.</p>
              </section>

              {/* Victory Actions */}
              <div className="victory-actions-row">
                {nextBossId ? (
                  <button
                    className="primary-button game-btn-3d"
                    onClick={() => handleSelectBoss(nextBossId)}
                  >
                    <ChevronRight size={18} /> Next Boss: Challenge {BOSS_CONFIGS[nextBossId].name} (Day {BOSS_CONFIGS[nextBossId].day})
                  </button>
                ) : (
                  <button className="primary-button game-btn-3d" onClick={onClose}>
                    <Check size={18} /> Final Boss Cleared! Continue Escape
                  </button>
                )}
                <button className="secondary-button" onClick={handleReplayArena}>
                  <RotateCcw size={15} /> Replay {currentBossConfig.name} Fight
                </button>
                <button className="secondary-button" onClick={onClose}>
                  Back to Island Map
                </button>
              </div>
            </div>
          ) : viewMode === "defeat" ? (
            /* ================= DEFEAT & REVIVE MECHANIC ================= */
            <div className="boss-defeat-view">
              <div className="defeat-banner">
                <AlertTriangle size={38} className="defeat-warning-icon" />
                <h3>CREW AMBUSHED!</h3>
                <p>
                  {currentBossConfig.name} overwhelmed you and depleted your health! You were knocked
                  back along the trail!
                </p>
                <span className="defeat-penalty-tag">-1 Checkpoint Progress Lost</span>
              </div>

              {/* Revive Card */}
              <div className="revive-token-card">
                <div className="revive-header">
                  <div className="revive-heart-badge">
                    <Heart size={28} className="revive-heart-icon" />
                  </div>
                  <div>
                    <h4>Island Recovery Revive Available!</h4>
                    <p>
                      Activate your revive totem to immediately restore your lost checkpoint progress
                      and jump right back into the fight with temporary shield!
                    </p>
                  </div>
                </div>

                <button
                  className="primary-button game-btn-3d revive-button"
                  disabled={reviving}
                  onClick={handleActivateRevive}
                >
                  {reviving ? (
                    <span>Channeling Revive Totem…</span>
                  ) : (
                    <>
                      <Zap size={18} /> USE REVIVE (Restore Lost Progress)
                    </>
                  )}
                </button>
              </div>

              {reviveSuccess && (
                <div className="revive-success-banner">
                  <Sparkles size={16} /> Progress restored! Re-entering arena with shield!
                </div>
              )}

              <div className="defeat-actions-row">
                <button className="secondary-button" onClick={() => setViewMode("arena")}>
                  <RotateCcw size={15} /> Retry Fight
                </button>
                <button className="secondary-button" onClick={onClose}>
                  Back to Map
                </button>
              </div>
            </div>
          ) : (
            /* ================= CONTRA RUN-AND-GUN ARENA ================= */
            <div className="boss-arena-wrapper">
              <ContraBossArena
                bossId={selectedBossId}
                crewCount={totalCrewCount}
                requiredCrewCount={requiredCrewCount}
                hasMetThreshold={hasMetThreshold}
                onVictory={handleArenaVictory}
                onDefeat={handleArenaDefeat}
                onRallyCrew={handleRallyCompanion}
                reviveTrigger={reviveTrigger}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
