import type { AvatarAccent, AvatarId } from "../lib/avatars";

export type GameMode = "loading" | "practice" | "online";

export type GamePlayer = {
  id: string;
  name: string;
  avatar: string;
  avatarId: AvatarId;
  avatarAccent: AvatarAccent;
  alive: boolean;
  won?: boolean;
  checkedIn: boolean;
  streak: number;
  progress: number;
  self: boolean;
};

export type GameRoom = {
  id: string;
  name: string;
  invite: string | null;
  timezone: string;
  phase?: string;
};

export type GameEvent = {
  username: string;
  event_type: string;
  milestone: number | null;
  reaction: string | null;
  game_date?: string;
  created_at?: string;
};

export type SignInInput = { email: string; password: string };
export type RegisterInput = SignInInput & { username: string; over18: boolean };
export type SettingsInput = { username: string; reminder: string };

export type GameContextValue = {
  mode: GameMode;
  ready: boolean;
  now: Date;
  day: string;
  timezone: string;
  isPregame: boolean;
  seasonFinished: boolean;
  seasonDaysAway: number;
  online: boolean;
  room: GameRoom;
  players: GamePlayer[];
  me: GamePlayer;
  username: string;
  reminder: string;
  reminderTimezone: string;
  streak: number;
  bestStreak: number;
  checkInCount: number;
  checkInDates: string[];
  practiceDay: number;
  checked: boolean;
  busy: boolean;
  events: GameEvent[];
  invitation: string;
  notice: string;
  installed: boolean;
  setNotice: (message: string) => void;
  checkIn: () => Promise<boolean>;
  reportSlip: () => Promise<void>;
  createRoom: (name: string) => Promise<void>;
  joinRoom: (invitation: string) => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  saveSettings: (input: SettingsInput) => Promise<void>;
  setAvatar: (avatar: AvatarId) => Promise<void>;
  setAvatarAccent: (accent: AvatarAccent) => Promise<void>;
  signOut: () => Promise<void>;
  sendReaction: (name: string, reaction: string) => Promise<void>;
  copyInvite: () => Promise<void>;
  enablePush: () => Promise<void>;
  installApp: () => Promise<void>;
  refresh: () => Promise<void>;
  resetPractice: () => void;
  resetPracticeDay: () => void;
  loseProgress?: (steps?: number) => void;
  restoreProgress?: (steps?: number) => void;
};

export type OnlineRoom = {
  id: string;
  name: string;
  invitation?: string | null;
  invite?: string | null;
  timezone: string;
  phase?: string;
  checkedInDays?: string[];
  players?: {
    id?: string;
    username: string;
    avatarId?: AvatarId;
    avatarAccent?: AvatarAccent;
    status: "alive" | "eliminated" | "won";
    checkedIn: boolean;
    streak: number;
    progress?: number;
    self: boolean;
  }[];
};
