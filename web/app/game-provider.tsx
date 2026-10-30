"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { consecutiveStreak, GAME_END, GAME_START, inviteToken, localDateKey } from "../lib/game-rules";
import { avatarAccentOrDefault, avatarOrDefault, DEFAULT_AVATAR, DEFAULT_AVATAR_ACCENT, isAvatarAccent, isAvatarId, type AvatarAccent, type AvatarId } from "../lib/avatars";
import type { GameContextValue, GameEvent, GameMode, GamePlayer, OnlineRoom, RegisterInput, SettingsInput, SignInInput } from "./game-types";

const PRACTICE_KEY = "escape-game-practice-v2";
const LEGACY_PRACTICE_KEY = "escape-game-practice-v1";
const PREVIEW_KEY = "escape-game-online-preview-v1";
const ROOM_KEY = "escape-game-selected-room";
const INVITATION_KEY = "escape-game-invite";
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const ROOM_ID_FORMAT = /^[0-9a-f-]{36}$/i;
const GameContext = createContext<GameContextValue | null>(null);

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type SessionResponse = {
  user: { username: string; avatarId?: AvatarId; avatarAccent?: AvatarAccent; timezone?: string; reminder?: string | null; remindersEnabled?: boolean } | null;
  room: OnlineRoom | null;
};

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, data?: Record<string, unknown>, method = "POST"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: data ? { "content-type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
  } catch {
    throw new ApiError("You are offline. Reconnect and try again.", 0);
  }
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    const message = result.error?.includes("DATABASE_URL")
      ? "Online play is not connected yet. You can still explore your practice island."
      : result.error || "That did not save. Please try again.";
    throw new ApiError(message, response.status);
  }
  return result as T;
}

function readStorage(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch { return null; }
}

function writeStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* Gameplay remains available when browser storage is disabled. */ }
}

function removeStorage(key: string) {
  try { localStorage.removeItem(key); }
  catch { /* Some private browsers do not permit persistent storage. */ }
}

function validDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => {
    if (typeof item !== "string") return [];
    const day = item.replace(/^practice-/, "");
    return DATE_FORMAT.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) ? [day] : [];
  }))].sort();
}

function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function currentStreak(days: string[], day: string): number {
  return consecutiveStreak(days, days.includes(day) ? day : previousDay(day));
}

function longestStreak(days: string[]): number {
  let longest = 0;
  let run = 0;
  let previous = "";
  for (const day of [...days].sort()) {
    run = previous === previousDay(day) ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || "").join("").toUpperCase() || "Y";
}

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function parseInvitation(raw: string): string | null {
  const text = raw.trim();
  const token = inviteToken(text);
  if (token) return token;
  try { return inviteToken(new URL(text, location.origin).searchParams.get("invite") || ""); }
  catch { return null; }
}

function normalizedRoom(room: OnlineRoom): OnlineRoom {
  return { ...room, players: room.players || [], checkedInDays: room.checkedInDays ? validDates(room.checkedInDays) : undefined };
}

export function GameProvider({ initialNow, children }: { initialNow: string; children: ReactNode }) {
  const [mode, setMode] = useState<GameMode>("loading");
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => new Date(initialNow));
  const [deviceTimezone, setDeviceTimezone] = useState("UTC");
  const [online, setOnline] = useState(true);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoom | null>(null);
  const [onlineUsername, setOnlineUsername] = useState("");
  const [onlineAvatar, setOnlineAvatar] = useState<AvatarId>(DEFAULT_AVATAR);
  const [onlineAccent, setOnlineAccent] = useState<AvatarAccent>(DEFAULT_AVATAR_ACCENT);
  const [onlineReminder, setOnlineReminder] = useState("");
  const [onlineProfileTimezone, setOnlineProfileTimezone] = useState("UTC");
  const [practiceName, setPracticeName] = useState("You");
  const [practiceAvatar, setPracticeAvatar] = useState<AvatarId>(DEFAULT_AVATAR);
  const [practiceAccent, setPracticeAccent] = useState<AvatarAccent>(DEFAULT_AVATAR_ACCENT);
  const [practiceReminder, setPracticeReminder] = useState("20:00");
  const [practiceDates, setPracticeDates] = useState<string[]>([]);
  const [practiceEliminated, setPracticeEliminated] = useState(false);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [invitation, setInvitation] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(false);
  const authenticated = useRef(false);
  const mounted = useRef(false);
  const selectedRoom = useRef("");
  const operationLock = useRef(false);
  const refreshVersion = useRef(0);
  const installPrompt = useRef<InstallPromptEvent | null>(null);

  const selectRoom = useCallback((id: string) => {
    selectedRoom.current = id;
    writeStorage(ROOM_KEY, id);
  }, []);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const selected = selectedRoom.current;
      let session: SessionResponse;
      try { session = await request<SessionResponse>(`/api/session${selected ? `?room=${encodeURIComponent(selected)}` : ""}`, undefined, "GET"); }
      catch (error) {
        if (selected && error instanceof ApiError && [400, 403, 404].includes(error.status)) {
          selectRoom("");
          session = await request<SessionResponse>("/api/session", undefined, "GET");
        } else throw error;
      }
      if (!mounted.current || version !== refreshVersion.current) return;
      if (!session.user) {
        const previouslySignedIn = authenticated.current;
        authenticated.current = false;
        setOnlineRoom(null);
        setOnlineUsername("");
        setMode("practice");
        removeStorage(PREVIEW_KEY);
        if (previouslySignedIn) setNotice("Your session has expired. Sign in to reconnect with your crew.");
        return;
      }
      authenticated.current = true;
      setOnlineUsername(session.user.username);
      setOnlineAvatar(avatarOrDefault(session.user.avatarId));
      setOnlineAccent(avatarAccentOrDefault(session.user.avatarAccent));
      setOnlineReminder(session.user.reminder ?? "");
      setOnlineProfileTimezone(session.user.timezone || browserTimezone());
      setOnlineRoom(session.room ? normalizedRoom(session.room) : null);
      if (session.room) selectRoom(session.room.id);
      setMode("online");
      setOnline(navigator.onLine);
    } catch (error) {
      if (!mounted.current || version !== refreshVersion.current) return;
      if (error instanceof ApiError && error.status === 401) {
        const previouslySignedIn = authenticated.current;
        authenticated.current = false;
        setOnlineRoom(null);
        setOnlineUsername("");
        setMode("practice");
        removeStorage(PREVIEW_KEY);
        if (previouslySignedIn) setNotice("Your session has expired. Sign in to reconnect with your crew.");
      } else {
        if (!authenticated.current) setMode("practice");
        if (authenticated.current && error instanceof ApiError && error.status >= 500) setNotice("Your crew is temporarily unavailable. Your saved session is safe; try refreshing again.");
        if (error instanceof ApiError && error.status === 0) setOnline(false);
      }
    }
  }, [selectRoom]);

  useEffect(() => {
    mounted.current = true;
    const init = () => {
      const stored = readStorage(PRACTICE_KEY) || readStorage(LEGACY_PRACTICE_KEY);
      if (stored && typeof stored === "object") {
        const saved = stored as { days?: unknown; name?: unknown; avatarId?: unknown; avatarAccent?: unknown; reminder?: unknown; eliminated?: unknown; room?: { players?: { self?: boolean; alive?: boolean }[] } };
        setPracticeDates(validDates(saved.days));
        if (typeof saved.name === "string" && saved.name.trim()) setPracticeName(saved.name.trim().slice(0, 24));
        setPracticeAvatar(avatarOrDefault(saved.avatarId));
        setPracticeAccent(avatarAccentOrDefault(saved.avatarAccent));
        if (typeof saved.reminder === "string") setPracticeReminder(saved.reminder);
        setPracticeEliminated(saved.eliminated === true || saved.room?.players?.some(player => player.self && player.alive === false) === true);
      }
      const roomId = readStorage(ROOM_KEY);
      if (typeof roomId === "string" && ROOM_ID_FORMAT.test(roomId)) selectedRoom.current = roomId;
      const preview = readStorage(PREVIEW_KEY);
      if (preview && typeof preview === "object") {
        const cached = preview as { username?: unknown; avatarId?: unknown; avatarAccent?: unknown; room?: OnlineRoom | null; reminder?: unknown; timezone?: unknown };
        if (typeof cached.username === "string" && cached.username && (!cached.room || (typeof cached.room.id === "string" && Array.isArray(cached.room.players)))) {
          authenticated.current = true;
          setOnlineUsername(cached.username);
          setOnlineAvatar(avatarOrDefault(cached.avatarId));
          setOnlineAccent(avatarAccentOrDefault(cached.avatarAccent));
          setOnlineRoom(cached.room ? normalizedRoom(cached.room) : null);
          setOnlineReminder(typeof cached.reminder === "string" ? cached.reminder : "");
          setOnlineProfileTimezone(typeof cached.timezone === "string" ? cached.timezone : browserTimezone());
          setMode("online");
        }
      }
      try {
        const savedInvite = new URLSearchParams(location.search).get("invite") || sessionStorage.getItem(INVITATION_KEY) || "";
        const token = inviteToken(savedInvite);
        if (token) { setInvitation(token); sessionStorage.setItem(INVITATION_KEY, token); }
      } catch { /* Invitations can still be pasted when session storage is unavailable. */ }
      setDeviceTimezone(browserTimezone());
      setNow(new Date());
      setOnline(navigator.onLine);
      setHydrated(true);
      void refresh().finally(() => { if (mounted.current) setReady(true); });
    };
    init();
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { mounted.current = false; clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);

  useEffect(() => {
    if (!hydrated) return;
    writeStorage(PRACTICE_KEY, { days: practiceDates, name: practiceName, avatarId: practiceAvatar, avatarAccent: practiceAccent, reminder: practiceReminder, eliminated: practiceEliminated });
  }, [hydrated, practiceDates, practiceName, practiceAvatar, practiceAccent, practiceReminder, practiceEliminated]);

  useEffect(() => {
    if (hydrated && mode === "online") writeStorage(PREVIEW_KEY, { username: onlineUsername, avatarId: onlineAvatar, avatarAccent: onlineAccent, reminder: onlineReminder, timezone: onlineProfileTimezone, room: onlineRoom });
  }, [hydrated, mode, onlineUsername, onlineAvatar, onlineAccent, onlineReminder, onlineProfileTimezone, onlineRoom]);

  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); installPrompt.current = event as InstallPromptEvent; };
    const markInstalled = () => { setInstalled(true); installPrompt.current = null; };
    const frame = requestAnimationFrame(() => setInstalled(matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true));
    const reconnect = () => { setOnline(true); void refresh(); };
    const disconnect = () => setOnline(false);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", markInstalled);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", markInstalled); window.removeEventListener("online", reconnect); window.removeEventListener("offline", disconnect); };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (mode !== "online" || !onlineRoom?.id) return;
    const roomId = onlineRoom.id;
    const sync = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || operationLock.current) return;
      try {
        const result = await request<{ events: GameEvent[] }>(`/api/room/feed?room=${encodeURIComponent(roomId)}`, undefined, "GET");
        if (mounted.current && selectedRoom.current === roomId) setEvents(result.events || []);
      } catch { /* Session refresh below handles authentication and connectivity. */ }
      await refresh();
    };
    void sync();
    const timer = setInterval(sync, 15_000);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", sync); };
  }, [mode, onlineRoom?.id, refresh]);

  const timezone = mode === "online" && onlineRoom?.timezone ? onlineRoom.timezone : deviceTimezone;
  const day = localDateKey(now, timezone);
  const username = mode === "online" ? onlineUsername || "You" : practiceName;
  const practiceStreak = currentStreak(practiceDates, day);
  const practiceMe: GamePlayer = { id: "practice-self", name: practiceName, avatar: initials(practiceName), avatarId: practiceAvatar, avatarAccent: practiceAccent, alive: !practiceEliminated, checkedIn: practiceDates.includes(day), streak: practiceStreak, progress: Math.min(30, practiceDates.length), self: true };
  const players: GamePlayer[] = mode === "online" ? (onlineRoom?.players || []).map((player, index) => ({ id: player.id || `cached-${index}`, name: player.username, avatar: initials(player.username), avatarId: avatarOrDefault(player.avatarId ?? (player.self ? onlineAvatar : undefined)), avatarAccent: avatarAccentOrDefault(player.avatarAccent ?? (player.self ? onlineAccent : undefined)), alive: player.status === "alive", won: player.status === "won", checkedIn: player.checkedIn, streak: player.streak, progress: Math.min(30, Math.max(0, player.progress ?? (player.self ? onlineRoom?.checkedInDays?.length : undefined) ?? player.streak)), self: player.self })) : [practiceMe];
  const me = players.find(player => player.self) || { id: "missing-self", name: username, avatar: initials(username), avatarId: onlineAvatar, avatarAccent: onlineAccent, alive: false, checkedIn: false, streak: 0, progress: 0, self: true };
  const checked = me.checkedIn;
  const streak = me.streak;
  const checkInCount = mode === "online" ? onlineRoom?.checkedInDays?.length ?? streak : practiceDates.length;
  const bestStreak = mode === "online" ? Math.max(streak, longestStreak(onlineRoom?.checkedInDays || [])) : longestStreak(practiceDates);
  const room = mode === "online"
    ? { id: onlineRoom?.id || "", name: onlineRoom?.name || "Your escape room", invite: onlineRoom?.invitation || onlineRoom?.invite || null, timezone, phase: onlineRoom?.phase }
    : { id: "practice", name: "Your practice island", invite: null, timezone, phase: "practice" };

  async function run<T>(action: () => Promise<T>): Promise<T> {
    if (operationLock.current) throw new Error("One moment. Your last action is still saving.");
    operationLock.current = true;
    refreshVersion.current += 1;
    setBusy(true);
    try { return await action(); }
    finally { operationLock.current = false; if (mounted.current) setBusy(false); }
  }

  function requireAccount() {
    if (mode !== "online") throw new Error("Create an account or sign in to play with your friends.");
  }

  function rememberInvitation(token: string) {
    setInvitation(token);
    try { sessionStorage.setItem(INVITATION_KEY, token); }
    catch { /* The in-memory invitation survives navigation while storage is disabled. */ }
  }

  function clearInvitation() {
    setInvitation("");
    try { sessionStorage.removeItem(INVITATION_KEY); }
    catch { /* The account has joined successfully even without storage access. */ }
    const url = new URL(location.href);
    if (url.searchParams.has("invite")) { url.searchParams.delete("invite"); history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`); }
  }

  function acceptRoom(next: OnlineRoom) {
    authenticated.current = true;
    selectRoom(next.id);
    setOnlineRoom(normalizedRoom(next));
    setEvents([]);
    setMode("online");
  }

  async function checkIn(): Promise<boolean> {
    if (!ready || busy || operationLock.current || checked) return false;
    if (!me.alive) { setNotice("Your run has ended. You can still cheer on your crew."); return false; }
    if (mode === "online" && !room.id) { setNotice("Create or join a room before checking in."); return false; }
    if (mode === "online" && (day < GAME_START || day > GAME_END)) { setNotice(day < GAME_START ? "Your room starts November 1. Your crew can gather before then." : "This November round is complete. Your final status is saved."); return false; }
    try {
      return await run(async () => {
        if (mode === "online") {
          const result = await request<{ date: string; streak: number }>("/api/check-in", { roomId: room.id });
          setOnlineRoom(current => current ? { ...current, checkedInDays: [...new Set([...(current.checkedInDays || []), result.date || day])], players: current.players?.map(player => player.self ? { ...player, checkedIn: true, streak: result.streak, progress: Math.min(30, (player.progress ?? current.checkedInDays?.length ?? player.streak) + 1) } : player) } : current);
          await refresh();
        } else {
          setPracticeDates(current => current.includes(day) ? current : [...current, day].sort());
        }
        setNotice("Day logged. Your next step is safe until tomorrow.");
        return true;
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) await refresh();
      setNotice(error instanceof Error ? error.message : "That did not save. Try checking in again.");
      return false;
    }
  }

  async function reportSlip() {
    await run(async () => {
      if (mode === "online") {
        await request("/api/report", { roomId: room.id, confirm: true });
        await refresh();
      } else setPracticeEliminated(true);
      setNotice("Your run has ended. The reason stays private.");
    });
  }

  async function createRoom(name: string) {
    requireAccount();
    await run(async () => {
      const result = await request<{ room: OnlineRoom }>("/api/rooms", { name: name.trim(), timezone: browserTimezone() });
      acceptRoom(result.room);
      await refresh();
      setNotice("Your room is ready. Send the invitation to your crew.");
    });
  }

  async function joinRoom(raw: string) {
    const token = parseInvitation(raw);
    if (!token) throw new Error("Paste a full invitation link or a valid invitation code.");
    rememberInvitation(token);
    requireAccount();
    await run(async () => {
      const result = await request<{ room: OnlineRoom }>("/api/rooms/join", { invite: token });
      acceptRoom(result.room);
      clearInvitation();
      await refresh();
      setNotice(`You joined ${result.room.name}. Your crew is ready.`);
    });
  }

  async function signIn(input: SignInInput) {
    await run(async () => {
      await request("/api/auth", { action: "login", ...input });
      authenticated.current = true;
      setMode("online");
      if (invitation) {
        try {
          const result = await request<{ room: OnlineRoom }>("/api/rooms/join", { invite: invitation });
          acceptRoom(result.room);
          clearInvitation();
        } catch (error) {
          await refresh();
          throw new Error(`You are signed in. ${error instanceof Error ? error.message : "Return to Join a room to retry your invitation."}`);
        }
      }
      await refresh();
      setNotice("Welcome back. Your escape is waiting.");
    });
  }

  async function register(input: RegisterInput) {
    await run(async () => {
      await request("/api/auth", { action: "register", ...input, timezone: browserTimezone(), invite: invitation });
      authenticated.current = true;
      setOnlineUsername(input.username.trim());
      setMode("online");
      clearInvitation();
      await refresh();
      setNotice("Your account is ready. Welcome to the island.");
    });
  }

  async function saveSettings(input: SettingsInput) {
    const name = input.username.trim();
    if (name.length < 2 || name.length > 24) throw new Error("Choose a display name between 2 and 24 characters.");
    if (input.reminder && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.reminder)) throw new Error("Choose a valid reminder time.");
    await run(async () => {
      if (mode === "online") {
        await request("/api/profile", { username: name, reminder: input.reminder, timezone: browserTimezone() }, "PATCH");
        setOnlineUsername(name);
        setOnlineReminder(input.reminder);
        setOnlineProfileTimezone(browserTimezone());
        await refresh();
        setNotice("Your profile and reminder time are saved.");
      } else {
        setPracticeName(name);
        setPracticeReminder(input.reminder);
        setNotice("Practice preferences saved on this device. An account is needed for background reminders.");
      }
    });
  }

  async function setAvatar(avatarId: AvatarId) {
    if (!isAvatarId(avatarId)) throw new Error("Choose an available avatar.");
    await run(async () => {
      if (mode === "online") {
        await request("/api/profile/avatar", { avatarId }, "PATCH");
        setOnlineAvatar(avatarId);
        setOnlineRoom(current => current ? { ...current, players: current.players?.map(player => player.self ? { ...player, avatarId } : player) } : current);
        await refresh();
      } else {
        setPracticeAvatar(avatarId);
      }
    });
  }

  async function setAvatarAccent(avatarAccent: AvatarAccent) {
    if (!isAvatarAccent(avatarAccent)) throw new Error("Choose an available avatar color.");
    await run(async () => {
      if (mode === "online") {
        await request("/api/profile/avatar", { avatarId: onlineAvatar, avatarAccent }, "PATCH");
        setOnlineAccent(avatarAccent);
        setOnlineRoom(current => current ? { ...current, players: current.players?.map(player => player.self ? { ...player, avatarAccent } : player) } : current);
        await refresh();
      } else {
        setPracticeAccent(avatarAccent);
      }
    });
  }

  async function signOut() {
    requireAccount();
    await run(async () => {
      await request("/api/auth", { action: "logout" });
      authenticated.current = false;
      selectRoom("");
      removeStorage(PREVIEW_KEY);
      setOnlineRoom(null);
      setOnlineUsername("");
      setEvents([]);
      setMode("practice");
      setNotice("You are signed out. Your local practice is still here.");
    });
  }

  async function sendReaction(name: string, reaction: string) {
    requireAccount();
    if (!room.id) throw new Error("Join a room before cheering on your crew.");
    if (!players.some(player => !player.self && player.name === name)) throw new Error("Choose a crewmate to cheer on.");
    await request("/api/reaction", { roomId: room.id, playerName: name, reaction });
    setNotice(`You cheered ${name} on.`);
  }

  async function copyInvite() {
    requireAccount();
    if (!room.invite) throw new Error("Create or join a room to get an invitation link.");
    const link = `${location.origin}/rooms/join?invite=${encodeURIComponent(room.invite)}`;
    try { await navigator.clipboard.writeText(link); }
    catch { throw new Error("This browser could not copy automatically. Select and copy your invitation link below."); }
    setNotice("Invitation copied. Send it to your friends.");
  }

  async function enablePush() {
    requireAccount();
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("This browser does not support background reminders. On iPhone, install the app from Safari first.");
    await run(async () => {
      const setting = await request<{ publicKey: string }>("/api/push/key", undefined, "GET");
      if (!setting.publicKey) throw new Error("Background reminders are not available yet. Your reminder time can still be saved.");
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications for this app in your browser settings, then try again.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const normalized = setting.publicKey.replace(/-/g, "+").replace(/_/g, "/");
      const key = Uint8Array.from(atob(normalized), character => character.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await request("/api/push/subscribe", { subscription: subscription.toJSON() });
      setNotice("Background reminders are on for this device.");
    });
  }

  async function installApp() {
    if (installed) { setNotice("The app is already installed on this device."); return; }
    if (!installPrompt.current) {
      const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent);
      setNotice(isApple ? "In Safari, tap Share, then Add to Home Screen." : "Open your browser menu and choose Install app or Add to Home Screen.");
      return;
    }
    try {
      const prompt = installPrompt.current;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      installPrompt.current = null;
      if (choice.outcome === "accepted") { setInstalled(true); setNotice("Your island is on your home screen."); }
    } catch { throw new Error("Use your browser menu to add the app to your home screen."); }
  }

  function resetPractice() {
    if (mode === "online") return;
    setPracticeDates([]);
    setPracticeEliminated(false);
    setNotice("Your practice island is ready for a fresh start.");
  }

  function resetPracticeDay() {
    if (mode !== "practice" || practiceEliminated) return;
    setPracticeDates(current => current.filter(date => date !== day));
    setNotice("Today's practice check-in was cleared. You can log it again.");
  }

  const loseProgress = useCallback((steps = 1) => {
    if (mode === "online") {
      setNotice(`Gatekeeper Ambush! Your crew took damage and lost ground.`);
      return;
    }
    setPracticeDates(current => current.slice(0, Math.max(0, current.length - steps)));
    setNotice(`The Gatekeeper ambush knocked your crew back (-${steps} checkpoint progress)!`);
  }, [mode]);

  const restoreProgress = useCallback(() => {
    if (mode === "online") {
      setNotice("Revive activated! Lost crew ground recovered!");
      return;
    }
    setPracticeDates(current => {
      const todayKey = localDateKey(new Date(), deviceTimezone);
      if (!current.includes(todayKey)) {
        return [...current, todayKey].sort();
      }
      return current;
    });
      setNotice("Revive activated! Lost checkpoint progress restored!");
  }, [deviceTimezone, mode]);

  const value: GameContextValue = {
    mode, ready, now, day, timezone, online, room, players, me, username,
    reminder: mode === "online" ? onlineReminder : practiceReminder,
    reminderTimezone: mode === "online" ? onlineProfileTimezone : deviceTimezone,
    isPregame: day < GAME_START,
    seasonFinished: day > GAME_END,
    seasonDaysAway: Math.max(0, Math.ceil((Date.parse(`${GAME_START}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000)),
    streak, bestStreak, checkInCount, checkInDates: mode === "online" ? onlineRoom?.checkedInDays || [] : practiceDates, practiceDay: Math.max(1, checkInCount + (checked ? 0 : 1)),
    checked, busy, events, invitation, notice, installed, setNotice,
    checkIn, reportSlip, createRoom, joinRoom, signIn, register, saveSettings, setAvatar, setAvatarAccent, signOut,
    sendReaction, copyInvite, enablePush, installApp, refresh, resetPractice, resetPracticeDay, loseProgress, restoreProgress,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const game = useContext(GameContext);
  if (!game) throw new Error("useGame must be used inside GameProvider.");
  return game;
}
