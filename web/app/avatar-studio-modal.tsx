"use client";

import { useEffect, useState } from "react";
import { Check, Dices, Sparkles, X, Palette, Shirt, Smile, Wand2 } from "lucide-react";
import { PlayerAvatar } from "./avatar";
import {
  ACCESSORIES,
  AVATAR_PRESETS,
  DEFAULT_MASCOT_CONFIG,
  EXPRESSIONS,
  HAIR_COLORS,
  HAIR_STYLES,
  JACKET_COLORS,
  SKIN_TONES,
  loadSavedMascotConfig,
  saveMascotConfig,
  type Accessory,
  type Expression,
  type HairColor,
  type HairStyle,
  type JacketColor,
  type MascotAvatarConfig,
  type SkinTone,
} from "../lib/avatar-customizer";
import { useGame } from "./game-provider";
import type { AvatarAccent, AvatarId } from "../lib/avatars";

interface AvatarStudioModalProps {
  open: boolean;
  onClose: () => void;
}

type TabType = "hair" | "jacket" | "face" | "accessories" | "skin";

export function AvatarStudioModal({ open, onClose }: AvatarStudioModalProps) {
  const game = useGame();
  const [config, setConfig] = useState<MascotAvatarConfig>(DEFAULT_MASCOT_CONFIG);
  const [activeTab, setActiveTab] = useState<TabType>("hair");
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => { setConfig(loadSavedMascotConfig()); setSavedSuccess(false); });
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);

  if (!open) return null;

  function randomize() {
    const randomItem = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const newConfig: MascotAvatarConfig = {
      hairStyle: randomItem(HAIR_STYLES).id,
      hairColor: randomItem(HAIR_COLORS).id,
      jacketColor: randomItem(JACKET_COLORS).id,
      expression: randomItem(EXPRESSIONS).id,
      accessory: randomItem(ACCESSORIES).id,
      skinTone: randomItem(SKIN_TONES).id,
    };
    setConfig(newConfig);
  }

  function applyPreset(presetConfig: MascotAvatarConfig) {
    setConfig({ ...presetConfig });
  }

  async function handleSave() {
    saveMascotConfig(config);

    // Map to game provider's avatarId and avatarAccent for database / online sync
    let mappedId: AvatarId = "fern";
    if (config.jacketColor === "crimson" || config.hairColor === "coral") mappedId = "coral";
    else if (config.jacketColor === "aqua" || config.hairColor === "neon") mappedId = "sky";
    else if (config.jacketColor === "gold" || config.hairColor === "blonde") mappedId = "sun";

    let mappedAccent: AvatarAccent = "sea";
    if (config.jacketColor === "crimson") mappedAccent = "coral";
    else if (config.jacketColor === "gold") mappedAccent = "sun";
    else if (config.jacketColor === "jungle") mappedAccent = "leaf";

    try {
      if (game.me.avatarId !== mappedId) await game.setAvatar(mappedId);
      if (game.me.avatarAccent !== mappedAccent) await game.setAvatarAccent(mappedAccent);
    } catch {
      // Continue even if online save failed; local avatar remains updated
    }

    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 600);
  }

  return (
    <div className="avatar-studio-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="studio-title">
      <div className="avatar-studio-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="avatar-studio-header">
          <div className="avatar-studio-title-group">
            <span className="studio-icon-badge"><Wand2 size={18} /></span>
            <div>
              <h2 id="studio-title">Mascot Studio</h2>
              <p>Customize your island escaper</p>
            </div>
          </div>
          <button className="studio-close-button" onClick={onClose} aria-label="Close studio">
            <X size={20} />
          </button>
        </div>

        {/* Live Preview Stage */}
        <div className="studio-preview-card">
          <div className="preview-water-backdrop" aria-hidden="true" />
          <div className="studio-avatar-display">
            <PlayerAvatar config={config} size={135} animated={true} />
            <div className="studio-avatar-shadow" aria-hidden="true" />
          </div>

          <div className="studio-quick-actions">
            <button className="studio-random-btn" onClick={randomize} title="Randomize look">
              <Dices size={16} /> Shuffle Style
            </button>
          </div>
        </div>

        {/* Presets Row */}
        <div className="studio-presets-row" aria-label="Style Presets">
          {AVATAR_PRESETS.map((preset) => (
            <button
              key={preset.name}
              className="studio-preset-chip"
              onClick={() => applyPreset(preset.config)}
              title={preset.name}
            >
              <span>{preset.icon}</span>
              <small>{preset.name}</small>
            </button>
          ))}
        </div>

        {/* Category Tabs */}
        <div className="studio-category-tabs" role="tablist">
          <button
            className={`studio-tab ${activeTab === "hair" ? "is-active" : ""}`}
            onClick={() => setActiveTab("hair")}
            role="tab"
            aria-selected={activeTab === "hair"}
          >
            <Palette size={15} /> Hair
          </button>
          <button
            className={`studio-tab ${activeTab === "jacket" ? "is-active" : ""}`}
            onClick={() => setActiveTab("jacket")}
            role="tab"
            aria-selected={activeTab === "jacket"}
          >
            <Shirt size={15} /> Jacket
          </button>
          <button
            className={`studio-tab ${activeTab === "face" ? "is-active" : ""}`}
            onClick={() => setActiveTab("face")}
            role="tab"
            aria-selected={activeTab === "face"}
          >
            <Smile size={15} /> Expression
          </button>
          <button
            className={`studio-tab ${activeTab === "accessories" ? "is-active" : ""}`}
            onClick={() => setActiveTab("accessories")}
            role="tab"
            aria-selected={activeTab === "accessories"}
          >
            <Sparkles size={15} /> Gear
          </button>
          <button
            className={`studio-tab ${activeTab === "skin" ? "is-active" : ""}`}
            onClick={() => setActiveTab("skin")}
            role="tab"
            aria-selected={activeTab === "skin"}
          >
            Skin
          </button>
        </div>

        {/* Tab Content Panel */}
        <div className="studio-options-scroll">
          {activeTab === "hair" && (
            <div className="studio-options-section">
              <label className="studio-section-label">Hair Style</label>
              <div className="studio-grid-options">
                {HAIR_STYLES.map((style) => (
                  <button
                    key={style.id}
                    className={`studio-option-card ${config.hairStyle === style.id ? "is-selected" : ""}`}
                    onClick={() => setConfig({ ...config, hairStyle: style.id })}
                  >
                    <span className="option-icon">{style.icon}</span>
                    <span className="option-label">{style.label}</span>
                  </button>
                ))}
              </div>

              <label className="studio-section-label" style={{ marginTop: "14px" }}>Hair Color</label>
              <div className="studio-color-grid">
                {HAIR_COLORS.map((color) => (
                  <button
                    key={color.id}
                    className={`studio-color-circle ${config.hairColor === color.id ? "is-selected" : ""}`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => setConfig({ ...config, hairColor: color.id })}
                    title={color.label}
                  >
                    {config.hairColor === color.id && <Check size={14} color="#ffffff" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "jacket" && (
            <div className="studio-options-section">
              <label className="studio-section-label">Fleece Zip Jacket Color</label>
              <div className="studio-jacket-grid">
                {JACKET_COLORS.map((jacket) => (
                  <button
                    key={jacket.id}
                    className={`studio-jacket-card ${config.jacketColor === jacket.id ? "is-selected" : ""}`}
                    style={{ "--jacket-base": jacket.primary, "--jacket-shadow": jacket.shadow } as React.CSSProperties}
                    onClick={() => setConfig({ ...config, jacketColor: jacket.id })}
                  >
                    <span className="jacket-swatch" />
                    <span className="option-label">{jacket.label}</span>
                    {config.jacketColor === jacket.id && <Check size={16} className="jacket-check" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "face" && (
            <div className="studio-options-section">
              <label className="studio-section-label">Mascot Mood / Expression</label>
              <div className="studio-grid-options">
                {EXPRESSIONS.map((exp) => (
                  <button
                    key={exp.id}
                    className={`studio-option-card ${config.expression === exp.id ? "is-selected" : ""}`}
                    onClick={() => setConfig({ ...config, expression: exp.id })}
                  >
                    <span className="option-icon">{exp.icon}</span>
                    <span className="option-label">{exp.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "accessories" && (
            <div className="studio-options-section">
              <label className="studio-section-label">Island Gear & Accessories</label>
              <div className="studio-grid-options">
                {ACCESSORIES.map((acc) => (
                  <button
                    key={acc.id}
                    className={`studio-option-card ${config.accessory === acc.id ? "is-selected" : ""}`}
                    onClick={() => setConfig({ ...config, accessory: acc.id })}
                  >
                    <span className="option-icon">{acc.icon}</span>
                    <span className="option-label">{acc.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "skin" && (
            <div className="studio-options-section">
              <label className="studio-section-label">Skin Tone</label>
              <div className="studio-skin-grid">
                {SKIN_TONES.map((tone) => (
                  <button
                    key={tone.id}
                    className={`studio-skin-card ${config.skinTone === tone.id ? "is-selected" : ""}`}
                    onClick={() => setConfig({ ...config, skinTone: tone.id })}
                  >
                    <span className="skin-circle" style={{ backgroundColor: tone.base }} />
                    <span className="option-label">{tone.label}</span>
                    {config.skinTone === tone.id && <Check size={16} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="avatar-studio-footer">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`primary-button game-btn-3d ${savedSuccess ? "is-success" : ""}`}
            onClick={handleSave}
          >
            {savedSuccess ? (
              <>
                <Check size={18} /> Saved!
              </>
            ) : (
              <>
                <Sparkles size={18} /> Equip Avatar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
