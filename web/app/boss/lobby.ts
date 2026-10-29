import type { AvatarAccent, AvatarId } from "../../lib/avatars";

export type LobbyPlayer = { id: string; name: string; avatarId: AvatarId; avatarAccent: AvatarAccent; x: number; y: number; alive: boolean; self: boolean; damageTotal?: number };
export type BossLobby = { opponent: "kirkify" | "diddy" | "epstein"; phase: "waiting" | "playing" | "won"; hp: number; maxHp: number; bossX: number; bossY: number; startedAt: string | null; host: boolean; players: LobbyPlayer[] };

export async function lobbyRequest(roomId: string, operation: string, values: Record<string, unknown> = {}): Promise<BossLobby | null> {
  const response = await fetch("/api/boss/lobby", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, operation, ...values }) });
  const result = await response.json() as { lobby?: BossLobby | null; error?: string };
  if (!response.ok) throw new Error(result.error || "The lobby could not be updated. Try again.");
  return result.lobby ?? null;
}
