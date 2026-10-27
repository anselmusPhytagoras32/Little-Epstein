# Product

## Platform and Stack

A mobile PWA built with Next.js 16 and TypeScript, configured to deploy on Render with Neon PostgreSQL. The user chose this stack and hosting. The app uses one phone layout, including when opened in a wider browser.

## Users and Purpose

Adults aged 18 and older playing a private November challenge with friends. Escape the Epstein combines an honest daily check-in, a Duolingo-inspired streak ritual, and a 30-day island escape route. The competitive round runs November 1–30, 2026. Missing a day or reporting a slip ends the player's run. Everyone still standing at the end wins.

## Experience

The home page is the full island route. Players can explore checkpoint details, find their current position, and use the daily check-in action. A successful check-in updates the route, moves the traveler, and provides a brief celebration. Motion respects reduced-motion preferences.

Streaks, crew, settings, accounts, room creation, invitations, reporting, and rules use dedicated page routes. The bottom navigation links `/`, `/streak`, `/crew`, and `/settings`; account and room flows use `/account`, `/account/sign-in`, `/account/register`, `/rooms/create`, and `/rooms/join`. `/report` protects the final reporting action with explicit confirmation, and `/how-to` explains the rules.

## Operating Context

Each room uses its host's IANA time zone for a shared midnight deadline. Players create or join private rooms before November begins and invite friends with a link. Invitation context survives account creation or sign-in. Room members see check-in and elimination status, while a self-reported reason remains private.

Local practice is a single-player preview stored in the browser. Its daily check-ins, streaks, display name, and reminder preferences stay on the device. It does not create an account, a shared room, or a multiplayer invitation. An ended practice can be explicitly restarted. Online rooms and competitive check-ins require Neon and a connection.

## Capabilities and Constraints

- Private account sessions, email-unique registration, password protection, invitation links, a 20-player room limit, daily check-ins, crew activity, streak milestones, and friendly reactions.
- Registration requires a self-confirmed age of 18 or older; no birth date is collected.
- One explicit check-in per room and calendar day. Opening the app alone does not count. The server enforces date boundaries and uniqueness.
- Strict elimination rules with no restore credits or make-up days. The scheduled worker processes missed deadlines and completed games while players are away.
- An installable portrait PWA with app icons, an installation screenshot, cached screens, and an offline fallback. Competitive writes require a connection.
- Reminder preferences and notification permission are separate. Background push requires server VAPID configuration and the player's opt-in on the device.
- Neon credentials, session tokens, and push private keys stay on the server. The owner supplies deployment secrets through private environment settings.
- Open decisions include future challenge years, launch audience, domain, email verification, account recovery, and privacy retention.

## Brand and Evidence

The user supplied the name, island game, masturbation and daily-attendance rules, a playful streak-focused tone, and Duolingo as a pattern reference. The visual direction uses the illustrated island, forest green, cream, amber progress markers, and clear mobile controls. Keep public copy respectful and never imply private reports have been independently verified.

`web/public/images/escape-island.png` is commissioned map artwork. No real player names, testimonials, endorsements, performance claims, or production room data were supplied. Practice presents the local player rather than a simulated live crew.

## Product Principles

- Keep today's honest check-in easy to find and make a saved result unmistakable.
- Make exploration, visible progress, milestones, and encouragement rewarding without weakening the rules.
- Use real page navigation, accessible controls, and graphics that fit the phone viewport.
- Give players control over reminders and respect reduced-motion preferences.
- Preserve progress across navigation and refreshes; label local practice and connection limits clearly.
- Keep private report details separate from the room activity friends need to see.
