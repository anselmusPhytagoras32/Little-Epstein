# Repository Guidelines

## Project Structure

`web/app/` holds the responsive Next.js interface and authenticated API routes. `web/lib/game-rules.ts` contains shared date, timezone, streak, and invitation rules. `web/db/migrations/` owns the Neon schema. `web/scripts/` provides migration, notification-key, and scheduled-game commands. `web/public/images/` contains shipped artwork. `render.yaml` defines the Render web service and scheduled job.

## Development and Build

Run commands from `web/` with Node.js 22 and pnpm 10.30.3:

- `corepack pnpm@10.30.3 install` installs locked dependencies.
- `corepack pnpm@10.30.3 dev` starts the local app at port 3000.
- `corepack pnpm@10.30.3 build` creates the production app.
- `corepack pnpm@10.30.3 db:migrate` applies the database schema; set `DATABASE_URL` first.
- `corepack pnpm@10.30.3 sweep` runs missed-day elimination, end-of-game winners, and opted-in reminder delivery.
- `corepack pnpm@10.30.3 exec tsc --noEmit` checks TypeScript types.

The UI and account routes can show local practice without a database. Real accounts and shared rooms require a Neon `DATABASE_URL`. See `web/README.md` before configuring Neon, VAPID push notifications, or Render.

## Coding Style and Tests

Use strict TypeScript, two-space indentation, named components, and descriptive lower-case paths. Keep room boundaries, local-midnight calculation, check-in uniqueness, and elimination behavior in the database-backed game layer. Do not expose private report reasons or service credentials to the browser. Keep interface text accessible, actions labeled, and small-screen layouts functional. No automated test framework is configured; run the build and type check for source changes.

## Commits and Pull Requests

This project has no earlier Git history, so use short, imperative commit subjects such as `Add Neon-backed daily reminders`. Pull requests should explain the player-facing change, describe changes to the game rules or schema, and report build or migration checks. Include a mobile screenshot for visible interface changes.

## Configuration and Artwork

Store local secrets in untracked `.env.local`; keep Neon passwords, session tokens, and private VAPID keys out of source, browser bundles, logs, and pull requests. Keep `pnpm-lock.yaml` in sync with `package.json`. Generated bitmap artwork belongs in `web/public/images/` with its source prompt and provenance documented nearby.
