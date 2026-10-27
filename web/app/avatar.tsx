import type { AvatarAccent, AvatarId } from "../lib/avatars";
import { useGame } from "./game-provider";

const portraits: Record<AvatarId, string> = {
  fern: "35 155 315 420",
  coral: "390 155 315 420",
  sky: "735 155 350 420",
  sun: "1100 155 310 420",
  builder: "35 625 320 400",
  scout: "390 625 315 400",
  chef: "735 625 350 400",
  diver: "1100 625 310 400",
};

/** A selectable character from the supplied sheet; controls provide its accessible name. */
export function PlayerAvatar({ avatarId, accent, size, animated = false }: { avatarId?: AvatarId; accent?: AvatarAccent; size?: number; animated?: boolean; config?: unknown }) {
  const game = useGame();
  const selected = avatarId ?? game.me.avatarId;
  const color = accent ?? game.me.avatarAccent ?? "sea";
  return <span className={`player-avatar avatar-${selected} accent-${color}${animated ? " avatar-animated" : ""}`} style={size ? { width: size, height: size } : undefined} aria-hidden="true">
    <svg className="avatar-sprite" viewBox={portraits[selected] || portraits.fern} focusable="false">
      <image href="/images/Pixel-Art%20Base%20Avatar%20Selection%20Sheet.png" width="1448" height="1086" />
    </svg>
  </span>;
}
