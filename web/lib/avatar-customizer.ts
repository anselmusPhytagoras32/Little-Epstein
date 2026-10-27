export type HairStyle = "mascot-wavy" | "spiky" | "slick" | "curls" | "cap" | "bandana";
export type HairColor = "silver" | "black" | "blonde" | "brown" | "neon" | "coral";
export type JacketColor = "navy" | "jungle" | "aqua" | "crimson" | "gold" | "sand";
export type Expression = "smug" | "grin" | "determined" | "cool" | "shocked";
export type Accessory = "none" | "aviators" | "flower" | "chain" | "snorkel" | "eyepatch";
export type SkinTone = "fair" | "tan" | "bronze" | "deep";

export interface MascotAvatarConfig {
  hairStyle: HairStyle;
  hairColor: HairColor;
  jacketColor: JacketColor;
  expression: Expression;
  accessory: Accessory;
  skinTone: SkinTone;
}

export const DEFAULT_MASCOT_CONFIG: MascotAvatarConfig = {
  hairStyle: "mascot-wavy",
  hairColor: "silver",
  jacketColor: "navy",
  expression: "smug",
  accessory: "none",
  skinTone: "tan",
};

export const AVATAR_PRESETS: { name: string; icon: string; config: MascotAvatarConfig }[] = [
  {
    name: "The Classic Mascot",
    icon: "Classic",
    config: {
      hairStyle: "mascot-wavy",
      hairColor: "silver",
      jacketColor: "navy",
      expression: "smug",
      accessory: "none",
      skinTone: "tan",
    },
  },
  {
    name: "Cool Surfer",
    icon: "Surfer",
    config: {
      hairStyle: "slick",
      hairColor: "blonde",
      jacketColor: "aqua",
      expression: "cool",
      accessory: "aviators",
      skinTone: "bronze",
    },
  },
  {
    name: "Island Pirate",
    icon: "Pirate",
    config: {
      hairStyle: "bandana",
      hairColor: "black",
      jacketColor: "crimson",
      expression: "determined",
      accessory: "eyepatch",
      skinTone: "tan",
    },
  },
  {
    name: "Tropical Explorer",
    icon: "Flower",
    config: {
      hairStyle: "curls",
      hairColor: "brown",
      jacketColor: "jungle",
      expression: "grin",
      accessory: "flower",
      skinTone: "fair",
    },
  },
  {
    name: "Golden VIP",
    icon: "Crown",
    config: {
      hairStyle: "spiky",
      hairColor: "neon",
      jacketColor: "gold",
      expression: "smug",
      accessory: "chain",
      skinTone: "deep",
    },
  },
];

export const HAIR_COLORS: { id: HairColor; label: string; hex: string; highlight: string }[] = [
  { id: "silver", label: "Silver (Mascot)", hex: "#a4abb3", highlight: "#e2e8f0" },
  { id: "black", label: "Midnight", hex: "#1e242b", highlight: "#475569" },
  { id: "blonde", label: "Sun Blonde", hex: "#f59e0b", highlight: "#fef08a" },
  { id: "brown", label: "Chestnut", hex: "#5c3d2e", highlight: "#9a6b52" },
  { id: "coral", label: "Sunset", hex: "#dc2626", highlight: "#fca5a5" },
  { id: "neon", label: "Cyber Blue", hex: "#0284c7", highlight: "#7dd3fc" },
];

export const JACKET_COLORS: { id: JacketColor; label: string; primary: string; shadow: string; zip: string }[] = [
  { id: "navy", label: "Navy (Mascot)", primary: "#172554", shadow: "#0f172a", zip: "#f59e0b" },
  { id: "jungle", label: "Jungle", primary: "#14532d", shadow: "#052e16", zip: "#facc15" },
  { id: "aqua", label: "Lagoon", primary: "#0891b2", shadow: "#164e63", zip: "#fef08a" },
  { id: "crimson", label: "Crimson", primary: "#991b1b", shadow: "#450a0a", zip: "#fef08a" },
  { id: "gold", label: "Golden VIP", primary: "#b45309", shadow: "#78350f", zip: "#ffffff" },
  { id: "sand", label: "Khaki Sand", primary: "#78716c", shadow: "#44403c", zip: "#f59e0b" },
];

export const SKIN_TONES: { id: SkinTone; label: string; base: string; shadow: string; blush: string }[] = [
  { id: "fair", label: "Fair Peach", base: "#fcd3b8", shadow: "#f0a27e", blush: "#fda4af" },
  { id: "tan", label: "Warm Tan", base: "#e8a474", shadow: "#c97645", blush: "#fb7185" },
  { id: "bronze", label: "Bronze", base: "#bd7647", shadow: "#934f26", blush: "#f43f5e" },
  { id: "deep", label: "Deep Rich", base: "#784428", shadow: "#4d2915", blush: "#be185d" },
];

export const ACCESSORIES: { id: Accessory; label: string; icon: string }[] = [
  { id: "none", label: "None", icon: "None" },
  { id: "aviators", label: "Aviator Shades", icon: "Shades" },
  { id: "flower", label: "Island Flower", icon: "Flower" },
  { id: "chain", label: "Gold Chain", icon: "Chain" },
  { id: "snorkel", label: "Snorkel", icon: "Snorkel" },
  { id: "eyepatch", label: "Pirate Patch", icon: "Pirate" },
];

export const EXPRESSIONS: { id: Expression; label: string; icon: string }[] = [
  { id: "smug", label: "Confident Smug", icon: "Confident" },
  { id: "grin", label: "Big Cheerful", icon: "Cheerful" },
  { id: "determined", label: "Determined", icon: "Determined" },
  { id: "cool", label: "Chill Cool", icon: "Chill" },
  { id: "shocked", label: "Surprised", icon: "Surprised" },
];

export const HAIR_STYLES: { id: HairStyle; label: string; icon: string }[] = [
  { id: "mascot-wavy", label: "Mascot Wavy", icon: "Wavy" },
  { id: "spiky", label: "Spiky Hair", icon: "Spiky" },
  { id: "slick", label: "Slicked Back", icon: "Slick" },
  { id: "curls", label: "Afro Curls", icon: "Curls" },
  { id: "cap", label: "Sailor Cap", icon: "Cap" },
  { id: "bandana", label: "Bandana", icon: "Pirate" },
];

const STORAGE_KEY = "escape-mascot-avatar-v2";

export function loadSavedMascotConfig(): MascotAvatarConfig {
  if (typeof window === "undefined") return DEFAULT_MASCOT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MASCOT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      hairStyle: HAIR_STYLES.some(h => h.id === parsed.hairStyle) ? parsed.hairStyle : DEFAULT_MASCOT_CONFIG.hairStyle,
      hairColor: HAIR_COLORS.some(h => h.id === parsed.hairColor) ? parsed.hairColor : DEFAULT_MASCOT_CONFIG.hairColor,
      jacketColor: JACKET_COLORS.some(j => j.id === parsed.jacketColor) ? parsed.jacketColor : DEFAULT_MASCOT_CONFIG.jacketColor,
      expression: EXPRESSIONS.some(e => e.id === parsed.expression) ? parsed.expression : DEFAULT_MASCOT_CONFIG.expression,
      accessory: ACCESSORIES.some(a => a.id === parsed.accessory) ? parsed.accessory : DEFAULT_MASCOT_CONFIG.accessory,
      skinTone: SKIN_TONES.some(s => s.id === parsed.skinTone) ? parsed.skinTone : DEFAULT_MASCOT_CONFIG.skinTone,
    };
  } catch {
    return DEFAULT_MASCOT_CONFIG;
  }
}

export function saveMascotConfig(config: MascotAvatarConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("mascot-avatar-updated", { detail: config }));
  } catch {
    // Local storage full or unavailable
  }
}
