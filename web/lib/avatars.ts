export const AVATAR_IDS = ["fern", "coral", "sky", "sun", "builder", "scout", "chef", "diver"] as const;
export type AvatarId = typeof AVATAR_IDS[number];
export const DEFAULT_AVATAR: AvatarId = "fern";
export const AVATAR_ACCENTS = ["sea", "coral", "sun", "leaf"] as const;
export type AvatarAccent = typeof AVATAR_ACCENTS[number];
export const DEFAULT_AVATAR_ACCENT: AvatarAccent = "sea";

export function isAvatarAccent(value: unknown): value is AvatarAccent {
  return typeof value === "string" && (AVATAR_ACCENTS as readonly string[]).includes(value);
}

export function avatarAccentOrDefault(value: unknown): AvatarAccent {
  return isAvatarAccent(value) ? value : DEFAULT_AVATAR_ACCENT;
}

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATAR_IDS as readonly string[]).includes(value);
}

export function avatarOrDefault(value: unknown): AvatarId {
  return isAvatarId(value) ? value : DEFAULT_AVATAR;
}
