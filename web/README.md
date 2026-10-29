# Escape the Epstein

A mobile PWA for an adult friend group's November challenge. The home page is a full island route: explore checkpoints, locate your next step, and log one honest day. In an online room, select a crewmate to find their progress and see whether they are still in or eliminated. The room refreshes while visible and also has a manual refresh. A saved check-in moves the traveler and celebrates progress. Account, room, settings, and reporting flows have their own page URLs.

The route scrolls through all 30 numbered days. The chest at the end opens an in-app letter after an eligible 30-day run; an ended run cannot unlock it. The island artwork and letter are included in the PWA for offline viewing.

Local practice has one player and stays on the current device. Practice check-ins, streaks, display name, and reminder preferences persist in browser storage. Sharing an invitation requires an online room. Accounts, multiplayer, room invitations, scheduled eliminations, and background reminders require the services below.

Avatar character and accent choices are saved on this device in practice and to the player profile online, where room members can see them on the map. After updating an existing Neon deployment, run `corepack pnpm@10.30.3 db:migrate` before using online accounts; Render runs this migration during pre-deploy.

The `/boss` page offers solo practice and private crew raids against Kirkify, Diddy, and Epstein. Signed-in members of the same room can join a lobby; the host starts the encounter and participants share boss health and see each other's positions. Boss health scales with the number of players present at the start. An endurance shield prevents a knockout before 5, 10, or 15 minutes respectively. Use the move and aim controls on touch (aiming also fires), or WASD/arrow keys to move, IJKL to aim, Space to fire, and Shift to dash. Raids do not change the daily run. Online lobbies require the database migration and a connection; enemy hazards are simulated locally on each device.

## Run locally

Use Node.js 22 and pnpm 10.30.3. From `web/`:

```powershell
corepack pnpm@10.30.3 install
corepack pnpm@10.30.3 dev
```

Open `http://localhost:3000` to use local practice. For online play, copy `.env.example` to `.env.local`, set `DATABASE_URL` to your Neon pooled connection string, and run `corepack pnpm@10.30.3 db:migrate`. Keep credentials private and out of Git.

## App pages

| Route | Purpose |
| --- | --- |
| `/` | Interactive island route, checkpoint details, daily check-in, and current-location control. |
| `/streak` | Current and best streak, run progress, and milestones. |
| `/crew` | Room roster, leaderboard, encouragement, and invitation actions. |
| `/settings` | Display name, reminder time, notification permission, and app installation. |
| `/account` | Account details and sign-out; `/account/sign-in` and `/account/register` handle authentication. |
| `/rooms/create`, `/rooms/join` | Create a private room or continue with a friend's invitation. |
| `/report`, `/how-to` | Confirm an honest report or read the rules. |

## Daily rules

- The competitive round runs **November 1–30, 2026**, using each room's time zone. Create rooms and gather the crew before November starts.
- One explicit **I'm still in** check-in counts per room and calendar day. Opening the app alone does not count.
- Missing a day ends the run, including while the player is offline. The scheduled worker checks missed deadlines.
- A confirmed slip report ends the player's run in every active room they joined. Room members see elimination status without the private reason.
- There are no restore credits or make-up check-ins. All players still standing after November 30 win.
- Practice also permits one check-in per local date. An ended local practice can be restarted; competitive runs remain final.

## Install on a phone

Deploy over HTTPS and use **Install** or the browser's **Add to Home Screen** option. The manifest includes standalone portrait display, app icons, and a phone screenshot. The service worker provides an offline fallback and previously cached screens. Online account, room, and competitive check-in updates need a connection; local practice stays on the device.

Reminder times alone do not grant notification permission. Players opt in under **Settings**; background delivery additionally requires VAPID configuration.

## Set up Neon and Render

1. Create a Neon project and obtain its pooled PostgreSQL URL.
2. Connect the repository to Render using the root `render.yaml` Blueprint. It creates one Free Next.js web service and applies database migrations when the app starts.
3. Set `DATABASE_URL` on the Render web service and as a GitHub Actions repository secret with the same Neon URL. In GitHub repository settings, also set the `SCHEDULED_SWEEP_ENABLED` Actions variable to `true` to enable the hourly game sweep. Until then, no recurring GitHub job runs. The hourly schedule can delay missed-day processing and reminders by up to about an hour.
4. On Render Free, the web service sleeps after 15 minutes without inbound traffic; the first visit after sleep can take about a minute to wake it. There is no paid keep-alive service.
5. For optional push reminders, generate VAPID keys with `corepack pnpm@10.30.3 push:keys`. Add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to the Render web service and all three values (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) as GitHub Actions secrets. Use a real contact address for `VAPID_SUBJECT`; keep private keys out of source and chat.
6. Open the deployed app, create an account, and choose a reminder under **Settings**. Enable background reminders separately on each device.

Without VAPID keys, check-ins and scheduled elimination still work. A saved reminder preference does not send a background notification until the owner configures VAPID and the player grants permission.

## Commands

| Command | Purpose |
| --- | --- |
| `corepack pnpm@10.30.3 dev` | Start local development. |
| `corepack pnpm@10.30.3 build` | Create the production build. |
| `corepack pnpm@10.30.3 start` | Serve the production build. |
| `corepack pnpm@10.30.3 lint` | Check application code with ESLint. |
| `corepack pnpm@10.30.3 ui:check` | Check routed screens, controls, persistence, and phone layouts in an isolated Chrome context. |
| `node scripts/onboarding-check.mjs` | Check first-visit progress, solo/crew choice, and deferring account creation in an isolated Chrome context. |
| `node scripts/boss-check.mjs` | Check boss controls, phase transitions, and layouts with an isolated Chrome context. |
| `node scripts/boss-lobby-check.mjs` | Exercise membership, health scaling, shared state, and host handoff against an isolated local database and app. Set `BOSS_TEST_DATABASE_URL` and `APP_URL` to loopback addresses. |
| `corepack pnpm@10.30.3 exec tsc --noEmit` | Check TypeScript types. |
| `corepack pnpm@10.30.3 db:migrate` | Apply the Neon schema. |
| `corepack pnpm@10.30.3 sweep` | Process missed days, winners, and opted-in reminders. |

The browser check needs Chrome launched with `--remote-debugging-port=9223` and a separate `--user-data-dir`. It uses isolated test storage and intercepts its authentication failure request, so it creates no real accounts. Set `APP_URL` to the preview origin; set `UI_CHECK_PWA=1` to check offline navigation against a production build. Captures are written to `../.impeccable/review/`.

The **Cloud confidence** GitHub Actions workflow runs lint, TypeScript, the production build, repeatable migrations, first-run and boss browser flows, and authenticated lobby integration against a disposable PostgreSQL database on pushes to `main` and pull requests. It uses throwaway players and a temporary local database; it does not need Neon credentials or write to production.
