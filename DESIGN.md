---
name: Escape the Epstein
description: A playful island escape with an honest daily ritual and a private crew.
colors:
  paper: "#a1cca6"
  white: "#dff0dc"
  ink: "#103d41"
  muted: "#315e5e"
  forest: "#086870"
  forest-dark: "#07545b"
  pale: "#bfe5cf"
  amber: "#f9d779"
  line: "#80bca5"
  ocean: "#097c87"
  turquoise: "#23ced9"
  coral: "#fca47c"
  danger: "#a84736"
typography:
  display:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "52px"
    fontWeight: 780
    lineHeight: 1
    letterSpacing: "-.04em"
  headline:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "29px"
    fontWeight: 750
    lineHeight: 1.14
    letterSpacing: "-.035em"
  title:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "18px"
    fontWeight: 720
    letterSpacing: "-.02em"
  body:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 650
rounded:
  field: "12px"
  control: "13px"
  surface: "16px"
  shell: "24px"
spacing:
  compact: "8px"
  control-gap: "9px"
  row-gap: "12px"
  stack: "14px"
  surface: "20px"
  page-inline: "22px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "12px 15px"
    width: "100%"
  button-primary-hover:
    backgroundColor: "{colors.forest-dark}"
  button-secondary:
    backgroundColor: "#f0f3e9"
    textColor: "#315c42"
    rounded: "{rounded.control}"
    padding: "12px 15px"
    width: "100%"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "12px 15px"
  surface:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.surface}"
    padding: "{spacing.surface}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "13px 14px"
    width: "100%"
  navigation-active:
    backgroundColor: "{colors.pale}"
    textColor: "{colors.forest-dark}"
    rounded: "{rounded.control}"
---

# Design System: Escape the Epstein

## Overview

The visual system pairs an illustrated tropical expedition with the tropical jade sunrise palette. Sage surfaces, deep ocean controls, turquoise highlights, coral and sun-yellow accents, and compact system type make progress clear while keeping the island playful.

The island is the signature artwork. Supporting screens use quieter stacked content, familiar controls, and generous space around the main action. The same portrait phone shell applies in a wide browser and an installed PWA.

**Key Characteristics:**

- Warm, natural colors and softly rounded controls.
- A navigable illustrated route with visible completed progress.
- Brief feedback tied to successful actions.
- Dedicated pages for account, room, rules, and reporting flows.

## Colors

The supplied palette uses ocean teal for action, sage for the main canvas, pale jade for surfaces, and coral and sun yellow for warm accents. Darker teal and lighter jade variations keep text and controls readable. The frontmatter records the reusable color primitives from the global stylesheet.

### Primary

- **Forest:** Primary buttons, selected navigation, field accents, and successful progress cues.
- **Deep Forest:** Primary hover, the brand mark, and high-contrast map labels.

### Secondary

- **Trail Amber:** Progress and streak emphasis. Map markers also use related warm sand and terracotta fills to remain distinct from completed green markers.

### Neutral

- **Warm Paper:** Main screen background.
- **Cream White:** Header, bottom navigation, form inputs, detail panel, and bordered surfaces.
- **Forest Ink:** Main reading color.
- **Sage Muted:** Secondary copy, helper text, and supporting labels.
- **Pale Sage:** Active navigation and quiet supporting controls.
- **Warm Line:** Dividers and low-contrast surface borders.

**The Meaningful Color Rule.** Completion uses green with check icons and status text. A future checkpoint remains distinguishable by its number, lock, and explanatory detail; color alone does not carry the state.

Use the danger color for the final action that ends a run. Supporting report copy uses a warm warning surface rather than making the entire page red.

## Typography

All text uses the native system sans-serif stack recorded in the frontmatter. There are no downloaded display fonts. Tight tracking and moderately heavy headings give the interface a friendly, compact game character.

- **Display:** The large streak count. Use tabular numbers for changing progress and statistics.
- **Headline:** Dedicated page titles, constrained to a readable width (370px). Titles reduce on narrow phones (27px).
- **Title:** Section headings. The route title has its own compact treatment (23px) and checkpoint titles are smaller (17px).
- **Body:** Page introductions and supporting copy. Map details are denser (12px, line-height 1.55), while form input text stays comfortably readable (16px).
- **Label:** Form labels and control text. Bottom navigation uses compact labels (11px); small map labels are supplemental to accessible checkpoint names.

**The Readable Action Rule.** Button copy uses sentence case and can wrap. Keep status text and action labels explicit rather than relying on an unlabeled icon.

## Layout

The application occupies one centered portrait shell with a maximum width (480px) and dynamic viewport height (`100dvh`). The surrounding browser has a muted sage background. Above phone width (481px), the shell gains rounded outer corners. Do not expand this into a desktop dashboard grid.

The shell is a vertical flex layout: header, page content, then four-column bottom navigation. The header includes the top safe-area inset; the tab bar includes the bottom safe-area inset. These remain in the layout rather than floating over content. The shell clips horizontal overflow; ordinary pages scroll inside the central content area.

Dedicated pages use stacked sections with a consistent gap (24px) and inline padding (22px). Bordered surfaces use comfortable internal padding (20px). Below narrow phone width (360px), page gutters reduce (17px), surfaces reduce (16px), and headings and route details become more compact. A short-height treatment (700px and below) reduces map heading and detail spacing.

The home screen reserves separate regions for route heading, scrollable artwork, and checkpoint details. The map canvas preserves its portrait ratio (2:3). Its illustrated background and SVG trail share a coordinate system, so checkpoint controls stay aligned with the trail. The detail panel and daily action sit below the artwork. The small “Find me” control stays within the map region.

**The One Scroll Owner Rule.** Ordinary pages scroll in the main content region; the map scrolls in its own stage. Preserve `min-height: 0`, flexible content, and `min-width: 0` on text-bearing rows so controls remain reachable in short or narrow viewports. Allow long names, invitation text, and feedback to wrap.

## Elevation & Depth

Depth is restrained on supporting pages: warm surfaces, thin borders, and spacing separate content. Shadows identify the framed phone shell and controls that sit above the illustrated terrain. Checkpoint selection adds a visible halo; notices rise above the bottom navigation.

### Shadow Vocabulary

- **Phone frame:** A broad, low-opacity forest shadow around the shell (`0 12px 60px #2547351c`).
- **Checkpoint:** A compact grounding shadow on map markers (`0 3px 9px #3a4d3540`). Selection adds a cream ring and stronger shadow (`0 0 0 4px #fff8d970, 0 4px 12px #1d472e4d`).
- **Map locator:** A small lifted shadow for the find control (`0 3px 12px #173b3326`).
- **Notice:** A stronger floating shadow (`0 8px 26px #15342626`).

## Shapes

Controls use soft rectangular corners. Fields use the field radius, buttons and icon containers use the control radius, and larger supporting surfaces use the surface radius. The phone frame only rounds on a wider browser.

Checkpoint markers are circular, with a cream stroke that separates them from the illustrated terrain. Their visible faces are smaller than their hit regions; preserve the full checkpoint control size (48px). Standard icon actions use a comfortable square target (44px). Small decorative labels and status chips are supplemental to the larger interactive controls.

## Components

### Buttons

Primary and secondary actions are full-width flex controls with centered icon-and-label content, a minimum height (51px), and compact internal spacing. Primary uses forest with white text and deepens on hover. Secondary uses pale green with a subtle border. The final report action uses the danger variant.

Pressing scales primary and secondary buttons slightly (0.98) over a short transition (150ms). Disabled actions use reduced opacity (0.55). An in-progress save replaces the icon with a small spinner and uses descriptive pending copy. Logged check-ins use pale green with a check icon and a link to the streak page.

### Cards / Containers

Supporting surfaces use cream white, a warm one-pixel border, and the surface radius. Prefer section spacing and dividers for lists; crew, milestone, settings, and rule rows do not each need a raised card. Text-bearing rows have flexible content and fixed-size leading icons or avatars.

### Inputs / Fields

Fields have a persistent label, cream fill, soft border, and readable input size (16px). Focus shifts the field border to green. The global keyboard focus treatment is a warm three-pixel outline with offset (3px). Helper and validation text wrap within the phone width. Checkboxes pair with full explanatory text for age confirmation and irreversible reporting.

### Navigation

The bottom navigation has four equal destinations: Escape (`/`), Streak (`/streak`), Crew (`/crew`), and Settings (`/settings`). Each combines an icon and text; the active page receives pale sage fill, deep forest text, and `aria-current="page"`. Secondary pages show a labeled route-home link in the header. Account, sign-in, registration, room creation, joining, report, and rules are real page routes.

The keyboard skip link appears on focus. Status notices use a dismiss button and a live status role, sit above the tab bar, and expire after a short interval (5.2 seconds). Offline state is an inline banner beneath the header.

### Illustrated Route

Use `web/public/images/escape-island.png` as the commissioned island artwork. A dashed cream trail shows the full route; warm gold progress and a forest traveler mark earned movement. Checkpoints show day number, complete check, or final harbor icon. The current step is larger and labeled; selection adds a halo and updates the detail panel. Checkpoints provide accessible names with day, landmark, and state.

A successful saved check-in briefly animates trail progress (900ms), traveler movement (1000ms), a stamped success symbol (500ms), and a small burst (1000ms). The celebration state clears after a short interval (1800ms). These effects follow the saved result. The standard easing is `cubic-bezier(.16, 1, .3, 1)`.

Reduced motion makes transitions effectively immediate, hides the burst, uses immediate map location, and avoids check-in vibration. The pending spinner remains a slow activity indicator. Selection and result text remain usable without animation.

### Streak and Crew

Streaks use an oversized count, warm flame accent, compact day tiles, and milestone rows. Completed days carry green fill and checks; today uses a warm highlighted outline. Crew rows combine rank, initials, name, status, streak, and an accessible cheer action when available.

Practice represents only the local player. Practice labels and screenshots must not imply a live crew, real competitive progress, or shared activity. Online status is presented from account and room state. Private report details never appear as crew activity.

## Do's and Don'ts

### Do:

- **Do** preserve the single phone shell, safe-area padding, and reachable bottom navigation.
- **Do** keep the daily action below the map in its own detail region.
- **Do** use persistent labels, visible focus, wrapped copy, and named icon controls.
- **Do** tie movement and celebration to a saved check-in and respect reduced motion.
- **Do** identify local practice clearly in visible copy and screenshots.
- **Do** distinguish completion, future steps, and pending work with text or icons as well as color.

### Don't:

- **Don't** introduce restore credits, make-up days, or competitive restart controls. Only an ended local practice may offer a fresh practice.
- **Don't** replace dedicated account, room, rules, or reporting pages with modal-only flows.
- **Don't** overlay large content panels across the illustrated map or place actions outside the phone viewport.
- **Don't** present fabricated players, activity, or public report reasons as real room evidence.
