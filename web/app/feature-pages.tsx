"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import {
  ArrowRight, Bell, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy,
  Download, Flame, Flag, Heart, LockKeyhole, LogOut, MapPin, Plus,
  ShieldCheck, Trophy, UserRound, UsersRound,
} from "lucide-react";
import { useGame } from "./game-provider";
import { ROOM_LIMIT } from "../lib/game-rules";
import { AVATAR_ACCENTS, AVATAR_IDS } from "../lib/avatars";
import { PlayerAvatar } from "./avatar";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "That did not save. Please try again.";
}

function usePageAction() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>, successMessage = "") {
    if (pending) return;
    setError("");
    setSuccess("");
    setPending(true);
    try {
      await action();
      setSuccess(successMessage);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return { error, success, pending, run };
}

function Feedback({ error, success }: { error: string; success: string }) {
  return <>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {success && <p className="inline-success" role="status"><CheckCircle2 size={17} />{success}</p>}
  </>;
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="page-heading"><h1>{title}</h1>{children && <p className="page-lead">{children}</p>}</header>;
}

function LoadingPage() {
  return <section className="screen"><div className="loading-surface" role="status" aria-label="Loading your escape"><span /><span /><span /></div></section>;
}

function AccountPrompt({ children }: { children?: ReactNode }) {
  return <div className="surface stack account-prompt">
    <span className="page-symbol"><UsersRound size={25} /></span>
    <h2>Bring your crew along.</h2>
    <p>{children || "Create an account to start a private room, invite friends, and share the November escape."}</p>
    <div className="page-actions"><Link className="primary-button" href="/account/register">Create an account <ArrowRight size={17} /></Link><Link className="secondary-button" href="/account/sign-in">I already have an account</Link></div>
  </div>;
}

const milestones = [
  { days: 1, name: "The first step", description: "Your escape begins with one honest day." },
  { days: 3, name: "Finding your rhythm", description: "Three days of showing up." },
  { days: 7, name: "One week strong", description: "A full week on the trail." },
  { days: 14, name: "Halfway there", description: "Two weeks behind you." },
  { days: 21, name: "The final stretch", description: "Three weeks closer to the boat." },
  { days: 30, name: "Off the island", description: "Thirty honest days. You made it." },
];

const gameRules = [
  { icon: CalendarDays, title: "November is your escape window.", text: "The challenge runs November 1–30, 2026. Your room follows its host's time zone, so the whole crew has one shared deadline." },
  { icon: CheckCircle2, title: "One honest tap, every day.", text: "Open the app and log your day before your room's midnight. Opening the app alone does not count as a check-in." },
  { icon: Flag, title: "The rules are strict.", text: "Miss a day or report a slip and your run ends. There are no restore credits or make-up check-ins." },
  { icon: ShieldCheck, title: "Keep your report private.", text: "Your friends see your game status. The reason for an elimination is not shown in your room's activity." },
  { icon: UsersRound, title: "Get off the island together.", text: "Invite friends before the month starts. Everyone still standing after November 30 wins. Spectators can keep encouraging the crew." },
];

export function StreakPage() {
  const game = useGame();
  const [monthOffset, setMonthOffset] = useState(0);
  if (!game.ready) return <LoadingPage />;
  const today = new Date(`${game.day}T00:00:00Z`);
  const weekStart = new Date(today);
  weekStart.setUTCDate(today.getUTCDate() - (today.getUTCDay() + 6) % 7);
  const week = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setUTCDate(date.getUTCDate() + index); return date; });
  const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
  const monthStart = month.getUTCDay();
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const dateKey = (date: Date) => date.toISOString().slice(0, 10);
  const checkedDates = new Set(game.checkInDates);
  const nextMilestone = milestones.find((milestone) => milestone.days > game.streak);

  return <section className="screen streak-screen">
    <div className="streak-intro"><h1>Your streak</h1>{game.mode === "practice" && <span><Flag size={13}/> Practice</span>}</div>
    <section className="streak-hero" aria-label={`${game.streak} day current streak`}>
      <Flame className="streak-hero-fire" size={100} fill="currentColor" strokeWidth={1.25}/>
      <p className="streak-hero-count">{game.streak}</p><p className="streak-hero-label">day streak!</p>
      <p className="streak-hero-message">{game.checked ? "Today is logged. Your escape continues tomorrow." : "One honest check-in is your next step."}</p>
    </section>
    <section className="week-card" aria-label="This week's check-ins">
      <ol className="week-days">{week.map((date, index) => { const key = dateKey(date); const logged = checkedDates.has(key); return <li key={key} aria-label={`${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}: ${logged ? "checked in" : key === game.day ? "today" : "no check-in"}`}><span>{date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</span><b className={`${logged ? "logged" : ""}${key === game.day ? " current" : ""}`} style={{ animationDelay: `${index * 45}ms` }}>{logged ? <Flame size={20} fill="currentColor"/> : <span/>}</b></li>; })}</ol>
      <p>{game.checked ? "Nice work showing up today." : "Check in each day to keep your streak going."}</p>
    </section>
    <div className="streak-stats"><div><Flag size={22}/><strong>{nextMilestone ? `${nextMilestone.days} days` : "Complete"}</strong><span>{nextMilestone ? "Next milestone" : "All milestones reached"}</span></div><div><Trophy size={22}/><strong>{game.bestStreak} {game.bestStreak === 1 ? "day" : "days"}</strong><span>Best streak</span></div></div>
    <section className="streak-calendar" aria-label="Check-in calendar"><div className="calendar-heading"><button onClick={() => setMonthOffset(value => value - 1)} aria-label="Previous month"><ChevronLeft size={20}/></button><h2 aria-live="polite">{month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2><button onClick={() => setMonthOffset(value => value + 1)} aria-label="Next month"><ChevronRight size={20}/></button></div>
      <div className="calendar-grid" aria-label="Calendar days">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="calendar-weekday">{day}</span>)}{Array.from({ length: monthStart }, (_, index) => <span key={`empty-${index}`}/>)}{Array.from({ length: daysInMonth }, (_, index) => { const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1)); const key = dateKey(date); const logged = checkedDates.has(key); return <span key={key} className={`calendar-date${logged ? " logged" : ""}${key === game.day ? " current" : ""}`} aria-label={`${date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}${logged ? ", checked in" : ""}${key === game.day ? ", today" : ""}`}>{index + 1}</span>; })}</div>
      <p className="calendar-key"><span/> Checked in <i/> Today</p>
    </section>
    <Link className="primary-button" href="/">{game.checked ? "Back to your escape" : "Go to today's check-in"}<MapPin size={17} /></Link>
    <section className="milestones-section"><div className="milestones-heading"><div><h2>Your escape milestones</h2><p>Every day brings you closer.</p></div><span>{milestones.filter(milestone => game.streak >= milestone.days).length} / {milestones.length} reached</span></div><ol className="milestone-list">{milestones.map((milestone) => {
      const earned = game.streak >= milestone.days;
      return <li key={milestone.days} className={`milestone-row${earned ? " earned" : ""}`}><span className="milestone-mark" aria-label={`${milestone.days} ${milestone.days === 1 ? "day" : "days"}`}><strong>{milestone.days}</strong><small>{milestone.days === 1 ? "DAY" : "DAYS"}</small></span><span className="milestone-copy"><strong>{milestone.name}</strong><small>{milestone.description}</small></span><span className="milestone-state">{earned ? <><Check size={14} /> Reached</> : "Ahead"}</span></li>;
    })}</ol></section>
    <Link className="text-link" href="/how-to">How the daily streak works <ChevronRight size={16} /></Link>
  </section>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "E";
}

export function CrewPage() {
  const game = useGame();
  const action = usePageAction();
  const [cheering, setCheering] = useState("");
  if (!game.ready) return <LoadingPage />;
  const players = [...game.players].sort((a, b) => Number(b.alive || b.won) - Number(a.alive || a.won) || b.streak - a.streak || Number(b.checkedIn) - Number(a.checkedIn) || a.name.localeCompare(b.name));
  const displayedPlayers = game.mode === "practice" ? players.filter((player) => player.self) : players;
  const alive = players.filter((player) => player.alive || player.won).length;
  const checkedIn = players.filter((player) => player.checkedIn).length;

  async function cheer(name: string) {
    setCheering(name);
    await action.run(() => game.sendReaction(name, "rooting"), `You cheered ${name} on.`);
    setCheering("");
  }

  const hasRoom = game.mode === "online" && !!game.room.id;

  return <section className="screen crew-screen">
    <Heading title={hasRoom ? "Your crew" : "Your escape crew"}>{game.mode === "practice" ? "You’re playing solo practice on this device." : hasRoom ? "See who’s still in and cheer each other on." : "Create or join a private room to play with friends."}</Heading>
    {game.mode === "practice" ? <section className="crew-invite">
      <div className="crew-invite-intro">
        <div><span className="crew-invite-tag">YOUR NEXT MOVE</span><h2>Don&apos;t escape alone.</h2><p>Make a private room and keep up with your friends on the island.</p></div>
        <span className="mascot-portrait mascot-hungry crew-invite-mascot" role="img" aria-label="The island mascot" />
      </div>
      <div className="page-actions"><Link className="primary-button" href="/account/register">Create an account <ArrowRight size={18} /></Link><Link className="secondary-button" href="/account/sign-in">Already have an account? Sign in</Link></div>
    </section> : <section className="surface crew-summary stack">
      {!hasRoom ? <><h2>Find your crew</h2><p>Create a room or join a friend with an invitation.</p><div className="page-actions"><Link className="primary-button" href="/rooms/create"><Plus size={17} />Create a room</Link><Link className="secondary-button" href="/rooms/join"><UsersRound size={17} />Join a room</Link></div></> : <>
      <div className="section-heading"><h2>{game.room.name}</h2><span className="status-pill"><UsersRound size={13} />Private room</span></div>
      <div className="stat-grid"><div><strong>{alive}<small>/{players.length}</small></strong><span>Still in</span></div><div><strong>{checkedIn}</strong><span>Logged today</span></div><div><strong>{ROOM_LIMIT - players.length}</strong><span>Open places</span></div></div>
      <p className="field-hint"><CalendarDays size={14} />Midnight deadline: {game.room.timezone}</p>
      <button className="primary-button" disabled={action.pending} onClick={() => void action.run(game.copyInvite, "Invitation copied. Send it to your friends.")}><Copy size={17} />{action.pending ? "Working…" : "Copy invitation link"}</button>
      </>}
    </section>}
    <Feedback error={action.error} success={action.success} />
    {(game.mode === "practice" || hasRoom) && <section className="stack crew-roster"><div className="section-heading"><h2>{game.mode === "practice" ? "Your practice run" : "Crew status"}</h2>{hasRoom && <span>{displayedPlayers.length} {displayedPlayers.length === 1 ? "player" : "players"}</span>}</div>
      <ol className="leaderboard-list member-list">{displayedPlayers.map((player, index) => <li className="leaderboard-row member-row" key={`${player.name}-${index}`}>
        {hasRoom && <span className="rank-number">{index + 1}</span>}
        <span className="member-avatar-mascot">
          <PlayerAvatar avatarId={player.avatarId} accent={player.avatarAccent} size={36} animated={false} />
        </span>
        <div className="member-info"><strong>{player.self ? game.username || "You" : player.name}{player.self && game.username && game.username !== "You" && <small>YOU</small>}</strong><span>{player.won ? "Escaped the island" : !player.alive ? "Spectating this round" : player.checkedIn ? "Checked in today" : "Today's check-in is waiting"}</span><span className="member-streak"><Flame size={14} />{player.streak}-day streak</span></div>
        {!player.self && game.mode === "online" ? <button className="member-action" aria-label={`Cheer for ${player.name}`} title={`Cheer for ${player.name}`} disabled={action.pending} onClick={() => void cheer(player.name)}>{cheering === player.name ? <span className="button-spinner" /> : <Heart size={18} />}</button> : player.checkedIn ? <CheckCircle2 size={21} className="member-checked" aria-label="Checked in" /> : <Flame size={21} className="member-waiting" aria-label="Waiting to check in" />}
      </li>)}</ol>
    </section>}
    {hasRoom && <div className="page-actions"><Link className="secondary-button" href="/rooms/create"><Plus size={17} />Create another room</Link><Link className="secondary-button" href="/rooms/join"><UsersRound size={17} />Join another room</Link></div>}
    {hasRoom && <p className="field-hint"><ShieldCheck size={15} />Your crew sees your status. The reason for an elimination stays private.</p>}
  </section>;
}

function SettingsAccount() {
  const game = useGame();
  const action = usePageAction();
  const [register, setRegister] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const credentials = { email: String(values.get("email") || ""), password: String(values.get("password") || "") };
    void action.run(async () => {
      if (register) await game.register({ ...credentials, username: String(values.get("username") || ""), over18: values.get("over18") === "on" });
      else await game.signIn(credentials);
    }, register ? "Account created." : "You’re signed in.");
  }

  if (game.mode === "online") return <div className="settings-panel-body"><p>Signed in as <strong>{game.username}</strong>.</p><Feedback error={action.error} success={action.success} /><button className="secondary-button" disabled={action.pending || game.busy} onClick={() => void action.run(game.signOut, "Signed out.")}><LogOut size={17} />{action.pending ? "Signing out…" : "Sign out"}</button></div>;
  return <div className="settings-panel-body"><p>Sign in to play with friends, or create an account.</p><form className="form-stack" onSubmit={submit}>
    {register && <label className="form-field"><span>Display name</span><input name="username" autoComplete="nickname" minLength={2} maxLength={24} required /></label>}
    <label className="form-field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
    <label className="form-field"><span>Password</span><input name="password" type="password" minLength={8} maxLength={128} autoComplete={register ? "new-password" : "current-password"} required /></label>
    {register && <label className="check-field"><input name="over18" type="checkbox" required /><span>I confirm that I am 18 years old or older.</span></label>}
    <Feedback error={action.error} success={action.success} />
    <button className="primary-button" disabled={action.pending || game.busy}>{action.pending ? "One moment…" : register ? "Create account" : "Sign in"}<ArrowRight size={17} /></button>
  </form><button className="settings-switch" type="button" onClick={() => setRegister(!register)}>{register ? "Already have an account? Sign in" : "New here? Create an account"}</button></div>;
}

function SettingsReport() {
  const game = useGame();
  const action = usePageAction();
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  if (game.me.won) return <div className="settings-panel-body"><p>You escaped! Your run is complete and cannot be reported.</p></div>;
  if (submitted || !game.me.alive) return <div className="settings-panel-body"><p>{submitted ? "Your report is saved. " : "Your run has ended. "}{game.mode === "practice" ? "You can start a fresh local practice." : "You can still cheer on your crew."}</p>{game.mode === "practice" && <button className="secondary-button" onClick={() => { game.resetPractice(); setSubmitted(false); setConfirmed(false); }}>Start a fresh practice <Flag size={17} /></button>}</div>;
  if (game.mode === "online" && (game.isPregame || game.seasonFinished)) return <div className="settings-panel-body"><p>Your competitive run isn’t active. Reports apply during November 1–30.</p></div>;
  return <form className="settings-panel-body form-stack" onSubmit={event => { event.preventDefault(); if (confirmed) void action.run(async () => { await game.reportSlip(); setSubmitted(true); }); }}>
    <p>{game.mode === "practice" ? "This ends your local practice run." : "This ends your run in every active room you’ve joined."} Your crew sees your status, not your reason. Streaks cannot be restored.</p>
    <label className="check-field"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required /><span>I understand that my run ends now.</span></label>
    <Feedback error={action.error} success={action.success} /><button className="primary-button danger-button" disabled={!confirmed || action.pending || game.busy}>{action.pending ? "Saving your report…" : "Confirm and end my run"}<Flag size={17} /></button>
  </form>;
}

export function SettingsPage() {
  const game = useGame();
  const action = usePageAction();
  const avatarAction = usePageAction();
  const deviceAction = usePageAction();
  const installAction = usePageAction();
  const accountDetails = useRef<HTMLDetailsElement>(null);
  if (!game.ready) return <LoadingPage />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void action.run(() => game.saveSettings({ username: String(values.get("username") || ""), reminder: String(values.get("reminder") || "") }), game.mode === "practice" ? "Practice preferences saved on this device." : "Your daily reminder and display name are saved.");
  }

  return <section className="screen settings-screen">
    <Heading title="Make the island yours.">Choose your swimmer and set up your daily routine.</Heading>
    {game.mode === "practice" && <p className="practice-banner"><Flag size={15} />Practice preferences are saved on this device.</p>}
    <section id="avatar" className="avatar-picker-card">
      <div className="avatar-picker-heading"><div className="avatar-hero-preview"><PlayerAvatar size={72}/></div><div className="avatar-hero-info"><h2>Your swimmer</h2><p>{game.mode === "practice" ? "Pick your look for this practice." : "Your crew will see your look on the map."}</p></div></div>
      <fieldset className="avatar-options" disabled={avatarAction.pending || game.busy}><legend>Choose a character</legend>{AVATAR_IDS.map((id, index) => <label className={`avatar-option${game.me.avatarId === id ? " is-selected" : ""}`} key={id}><input type="radio" name="avatar" value={id} checked={game.me.avatarId === id} onChange={() => void avatarAction.run(() => game.setAvatar(id), "Character saved.")}/><PlayerAvatar avatarId={id} accent={game.me.avatarAccent}/><span>{["Explorer", "Survivor", "Fisherman", "Medic", "Builder", "Scout", "Chef", "Diver"][index]}</span>{game.me.avatarId === id && <Check className="avatar-option-check" size={13} aria-hidden="true" />}</label>)}</fieldset>
      <fieldset className="avatar-accent-options" disabled={avatarAction.pending || game.busy}><legend>Accent color</legend>{AVATAR_ACCENTS.map(accent => <label className={`avatar-accent-option${game.me.avatarAccent === accent ? " is-selected" : ""}`} key={accent}><input type="radio" name="avatarAccent" value={accent} checked={game.me.avatarAccent === accent} onChange={() => void avatarAction.run(() => game.setAvatarAccent(accent), "Accent saved.")}/><span className={`accent-swatch accent-${accent}`}/>{accent.charAt(0).toUpperCase() + accent.slice(1)}</label>)}</fieldset>
      <Feedback error={avatarAction.error} success={avatarAction.success}/>
    </section>
    <form className="surface form-stack settings-routine" onSubmit={submit}>
      <div><h2>Your daily routine</h2><p>Set a name and an optional reminder time.</p></div>
      <label className="form-field"><span>Display name</span><input name="username" defaultValue={game.username || "Explorer"} minLength={2} maxLength={24} autoComplete="nickname" required /></label>
      <label className="form-field"><span>Daily reminder</span><input name="reminder" type="time" defaultValue={game.reminder} /></label>
      <p className="field-hint">Reminder time zone: {game.reminderTimezone}. Clear the reminder time to turn the schedule off.</p>
      <Feedback error={action.error} success={action.success} />
      <button className="primary-button" disabled={action.pending || game.busy}>{action.pending ? "Saving…" : "Save changes"}<Check size={17} /></button>
    </form>
    <section className="settings-device"><div className="settings-device-heading"><span className="settings-device-icon"><Bell size={21} /></span><div><h2>Never miss a check-in</h2><p>Reminders are optional. You still need to check in yourself.</p></div></div>
      {game.mode === "online" ? <button className="secondary-button" disabled={deviceAction.pending} onClick={() => void deviceAction.run(game.enablePush, "This device is ready for your opted-in reminders.")}><Bell size={17} />Enable reminders</button> : <button className="secondary-button" onClick={() => { if (accountDetails.current) { accountDetails.current.open = true; accountDetails.current.scrollIntoView({ block: "start", behavior: "auto" }); } }}><UserRound size={17} />Sign in to enable reminders</button>}
      <Feedback error={deviceAction.error} success={deviceAction.success} />
    </section>
    <section className="settings-install"><div><h2>Your island, one tap away</h2><p>Add the app to your home screen for easy access.</p></div>{game.installed ? <p className="settings-installed"><CheckCircle2 size={17} />App installed</p> : <button className="secondary-button" disabled={installAction.pending} onClick={() => void installAction.run(game.installApp)}><Download size={17} />Install app</button>}<Feedback error={installAction.error} success={installAction.success} /></section>
    <section className="settings-more" aria-label="Account and game information">
      <details ref={accountDetails} className="settings-disclosure"><summary><UserRound size={20} /><span><strong>Your account</strong><small>{game.mode === "online" ? "Account and sign out" : "Sign in or create an account"}</small></span><ChevronDown size={19} /></summary><SettingsAccount /></details>
      <details className="settings-disclosure"><summary><ShieldCheck size={20} /><span><strong>Game rules</strong><small>How the escape works</small></span><ChevronDown size={19} /></summary><div className="settings-panel-body settings-rules"><ol>{gameRules.map(rule => <li key={rule.title}><strong>{rule.title}</strong><p>{rule.text}</p></li>)}</ol></div></details>
      <details className="settings-disclosure"><summary><Flag size={20} /><span><strong>Report a slip</strong><small>Read before ending your run</small></span><ChevronDown size={19} /></summary><SettingsReport /></details>
    </section>
  </section>;
}

export function AccountPage() {
  const game = useGame();
  const router = useRouter();
  const action = usePageAction();
  if (!game.ready) return <LoadingPage />;

  return <section className="screen account-screen">
    <Heading title="Your little escape.">{game.mode === "online" ? "Your account keeps your crew and progress together across devices." : "Try the route on this phone, then bring your friends into a private room."}</Heading>
    {game.mode === "online" ? <>
      <section className="surface stack"><span className="account-mark">{initials(game.username)}</span><h2>{game.username}</h2><p className="field-hint"><LockKeyhole size={15} />Signed in · Private room membership</p><Link className="secondary-button" href="/settings">Edit your name and reminders <ChevronRight size={17} /></Link></section>
      <div className="link-list"><Link className="link-row" href="/crew"><UsersRound size={19} /><span>{game.room.name}</span><ChevronRight size={17} /></Link><Link className="link-row" href="/rooms/create"><Plus size={19} /><span>Create another room</span><ChevronRight size={17} /></Link><Link className="link-row" href="/rooms/join"><UsersRound size={19} /><span>Join a friend&apos;s room</span><ChevronRight size={17} /></Link></div>
      <Feedback error={action.error} success={action.success} />
      <button className="secondary-button" disabled={action.pending} onClick={() => void action.run(async () => { await game.signOut(); router.replace("/"); })}><LogOut size={17} />{action.pending ? "Signing out…" : "Sign out"}</button>
    </> : <><AccountPrompt /><section className="stack"><h2>Your privacy comes first.</h2><p>Friends see your daily game status. Your private report reason is never added to the room&apos;s activity.</p><Link className="text-link" href="/how-to">Read the game rules <ChevronRight size={16} /></Link></section></>}
  </section>;
}

function AuthPage({ register }: { register: boolean }) {
  const game = useGame();
  const router = useRouter();
  const action = usePageAction();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void action.run(async () => {
      const credentials = { email: String(values.get("email") || ""), password: String(values.get("password") || "") };
      if (register) await game.register({ ...credentials, username: String(values.get("username") || ""), over18: values.get("over18") === "on" });
      else await game.signIn(credentials);
      router.replace("/crew");
    });
  }

  return <section className="screen auth-screen">
    <header className="auth-intro">
      <div className="auth-intro-copy"><span className="auth-intro-tag">{register ? "JOIN THE ESCAPE" : "WELCOME BACK"}</span><h1>{register ? "Bring your crew along." : "Back to the island."}</h1><p>{game.invitation ? "Your friend’s invite is saved. Sign in or create an account to join them." : register ? "Create an account to invite friends and track your escape together." : "Sign in to find your crew and continue your escape."}</p></div>
      <span className="mascot-portrait mascot-worried auth-mascot" role="img" aria-label="The island mascot" />
    </header>
    {game.mode === "online" ? <section className="surface stack"><p>You are already signed in as {game.username}.</p><Link className="primary-button" href="/crew">Go to your crew <ArrowRight size={17} /></Link></section> : <>
      <form className="form-stack" onSubmit={submit}>
        {register && <label className="form-field"><span>Display name</span><input name="username" autoComplete="nickname" placeholder="A name your friends know" minLength={2} maxLength={24} required /></label>}
        <label className="form-field"><span>Email</span><input name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" required /></label>
        <label className="form-field"><span>Password</span><input name="password" type="password" minLength={8} maxLength={128} autoComplete={register ? "new-password" : "current-password"} placeholder="At least 8 characters" required /></label>
        {register && <label className="check-field"><input type="checkbox" name="over18" required /><span>I confirm that I am 18 years old or older.</span></label>}
        <Feedback error={action.error} success={action.success} />
        <button className="primary-button" disabled={action.pending || game.busy}>{action.pending ? "One moment…" : register ? "Create my account" : "Sign in"}<ArrowRight size={17} /></button>
      </form>
      <p className="field-hint">{register ? "Already have an account?" : "New to the island?"} <Link className="text-link" href={register ? "/account/sign-in" : "/account/register"}>{register ? "Sign in" : "Create an account"}</Link></p>
      <Link className="text-link" href="/">Back to local practice <ChevronRight size={16} /></Link>
    </>}
  </section>;
}

export function SignInPage() { return <AuthPage register={false} />; }
export function RegisterPage() { return <AuthPage register />; }

export function CreateRoomPage() {
  const game = useGame();
  const router = useRouter();
  const action = usePageAction();
  if (!game.ready) return <LoadingPage />;
  const creationTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void action.run(async () => { await game.createRoom(String(values.get("room") || "")); router.push("/crew"); });
  }

  return <section className="screen room-form-screen">
    <Heading title="Name your escape room.">Choose a name your group will recognise, then send them your private invitation link.</Heading>
    {game.mode !== "online" ? <AccountPrompt>Create an account before opening an online room. Local practice stays on this phone.</AccountPrompt> : !game.isPregame ? <section className="surface stack"><CalendarDays size={27} /><h2>The November crew is locked in.</h2><p>New rooms open before November 1. Keep following your current crew&apos;s escape route.</p><Link className="primary-button" href="/crew">Back to your crew <ArrowRight size={17} /></Link></section> : <form className="form-stack" onSubmit={submit}>
      <label className="form-field"><span>Room name</span><input name="room" minLength={2} maxLength={36} placeholder="The Night Shift" required autoComplete="off" /></label>
      <p className="field-hint"><CalendarDays size={15} />The room uses {creationTimezone}. Everyone shares the same midnight deadline.</p>
      <p className="field-hint">Room for up to {ROOM_LIMIT} friends, including you.</p>
      <Feedback error={action.error} success={action.success} />
      <button className="primary-button" disabled={action.pending || game.busy}>{action.pending ? "Gathering the crew…" : "Create my room"}<Plus size={17} /></button>
    </form>}
    <Link className="text-link" href="/rooms/join">Have an invitation? Join a room <ChevronRight size={16} /></Link>
  </section>;
}

function validInvitation(value: string) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{32,64}$/.test(trimmed)) return true;
  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get("invite") || "";
    return /^https?:$/.test(url.protocol) && /^[A-Za-z0-9_-]{32,64}$/.test(token);
  } catch { return false; }
}

export function JoinRoomPage() {
  const game = useGame();
  const router = useRouter();
  const action = usePageAction();
  if (!game.ready) return <LoadingPage />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const invitation = String(values.get("invite") || "");
    void action.run(async () => {
      if (!validInvitation(invitation)) throw new Error("Paste the complete invitation link your friend sent you.");
      if (game.mode !== "online") {
        try { await game.joinRoom(invitation); }
        catch (caught) {
          if (!/account|sign.?in/i.test(errorMessage(caught))) throw caught;
        }
        router.push("/account/sign-in");
        return;
      }
      await game.joinRoom(invitation);
      router.push("/crew");
    });
  }

  return <section className="screen room-form-screen">
    <Heading title="Your friend saved a place.">Paste your invitation to find the right crew. Invitations work before the November challenge starts.</Heading>
    <form className="form-stack" onSubmit={submit}>
      <label className="form-field"><span>Room invitation</span><input name="invite" defaultValue={game.invitation} placeholder="Paste your invitation link" autoComplete="off" autoCapitalize="none" spellCheck={false} required /></label>
      {game.mode !== "online" && <p className="field-hint">We will keep the invitation while you sign in or create your account.</p>}
      <Feedback error={action.error} success={action.success} />
      <button className="primary-button" disabled={action.pending || game.busy}>{action.pending ? "Finding your crew…" : game.mode === "online" ? "Join my friends" : "Continue with invitation"}<UsersRound size={17} /></button>
    </form>
    <Link className="text-link" href="/rooms/create">No invitation yet? Create a room <ChevronRight size={16} /></Link>
  </section>;
}

export function ReportPage() {
  const game = useGame();
  const router = useRouter();
  const action = usePageAction();
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  if (!game.ready) return <LoadingPage />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    void action.run(async () => { await game.reportSlip(); setSubmitted(true); });
  }

  if (game.me?.won) return <section className="screen report-screen"><span className="page-symbol"><Trophy size={27} /></span><Heading title="You made it off the island.">Your November run is complete. There is no active run to report.</Heading><Link className="primary-button" href="/crew">Celebrate with your crew <Trophy size={17} /></Link><Link className="secondary-button" href="/">See your completed route <MapPin size={17} /></Link></section>;

  if (submitted || !game.me?.alive) return <section className="screen report-screen"><span className="mascot-portrait mascot-report mascot-hungry" role="img" aria-label="The island mascot after your run ends"/><Heading title={submitted ? "Thanks for keeping it honest." : "You are spectating this round."}>{game.mode === "practice" ? "This local practice run has ended. Start a fresh practice to explore the route again." : "Your run has ended. Your friends can see your game status, and your report reason stays private."}</Heading>{game.mode === "practice" ? <button className="primary-button" onClick={() => { game.resetPractice(); router.push("/"); }}>Start a fresh practice <Flag size={17} /></button> : <Link className="primary-button" href="/crew">Cheer on your crew <Heart size={17} /></Link>}<Link className="secondary-button" href="/">Back to the island <MapPin size={17} /></Link></section>;

  return <section className="screen report-screen">
    <span className="page-symbol"><Heart size={27} /></span>
    <Heading title="Ready to report a slip?">Keeping it honest is part of the game. Take a moment before ending your run.</Heading>
    {game.mode === "online" && (game.isPregame || game.seasonFinished) ? <section className="surface stack"><p>Your competitive run is not active. Honest reports apply during November 1–30.</p><Link className="primary-button" href="/">Back to your escape <MapPin size={17} /></Link></section> : <form className="form-stack" onSubmit={submit}>
      <div className="report-warning"><ShieldCheck size={21} /><p>{game.mode === "practice" ? "This ends your local practice run." : "This ends your run in every active room you have joined."} Friends see that you were eliminated, not your reason. Streaks cannot be restored.</p></div>
      <label className="check-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required /><span>I am reporting honestly. I understand that my run ends now.</span></label>
      <Feedback error={action.error} success={action.success} />
      <button className="primary-button danger-button" disabled={!confirmed || action.pending || game.busy}>{action.pending ? "Saving your report…" : "Confirm and end my run"}<Flag size={17} /></button>
      <Link className="secondary-button" href="/">Keep exploring for now</Link>
    </form>}
  </section>;
}

export function HowToPage() {
  const game = useGame();
  return <section className="screen rules-screen">
    <Heading title="An honest escape." >A quick daily ritual, a private crew, and one November route to finish.</Heading>
    <ol className="rule-list">{gameRules.map(({ icon: Icon, title, text }) => <li className="rule-row" key={title}><span className="page-symbol"><Icon size={22} /></span><div><h2>{title}</h2><p>{text}</p></div></li>)}</ol>
    <p className="field-hint"><MapPin size={16} />{game.mode === "online" ? `Your room's time zone: ${game.room.timezone}.` : "Local practice is a preview on this device. Create an account for an online room."}</p>
    <Link className="primary-button" href="/">Back to the route <ArrowRight size={17} /></Link>
    <Link className="secondary-button" href="/report">Report a slip honestly <Heart size={17} /></Link>
  </section>;
}
