# ShareMoney Landing Page Design Guide

This document is the canonical reference for the landing-page redesign.

## Positioning
- Tone: warm, practical, mature consumer-finance brand.
- Audience: people coordinating shared costs across trips, roommates, and friend groups.
- Promise: clear balances, predictable settlement outcomes, and explicit payment boundaries.

## Core Copy
- H1: `Shared expenses, clearly settled.`
- Tagline: `Track trips, homes, and dinner groups in one place. ShareMoney keeps every balance visible and reduces the payments needed to settle up.`
- Trust line: `No bank connection. No payment handling. Just a clear shared record.`
- Search intent focus: shared expense tracker, split expenses, group balances, settle up.

## Primary Conversion
- Android visitors: `Get the Android app`
- iOS visitors: `Join the iOS beta`
- Desktop visitors: Android is primary.
- Secondary actions: remaining two destinations (`Open web app`, other platform action).
- CTA event: `landing_cta_click` with `{ platform, placement, device }`.

## Visual System
- Identity: `Group Pocket`, a compact wallet holding coral and green money slips.
- The mark must read as money coordination at favicon size. Do not use routing paths,
  transfer arrows, abstract nodes, or line diagrams as the primary brand metaphor.
- Palette
  - Canvas `#F7F9FC`
  - Ink `#17202A`
  - Action blue `#1F5EFF`
  - Social coral `#E76F51`
  - Success green `#087A55`
- 4px spacing and 4/8px radii.
- Font: `Instrument Sans Variable`, loaded through `@fontsource-variable`.
- Content width: `1180px`.
- Dark mode is supported with equivalent contrast treatment.

## Layout Rules
1. Sticky compact nav with section links + theme control + primary `Get the app` CTA.
2. Hero: `Group Story Poster`, with headline and actions above a real group context. The
   product screenshot sits inside that social story instead of floating as a device mockup.
3. Product proof: `Group Pulse`, combining named member balances, a shared activity
   timeline, and the final settlement result in one connected view.
4. Use-case tabs: Trips / Roommates / Dinner Groups.
5. 3-step workflow: Add expenses / Split fairly / Settle clearly.
6. Alternating feature rows: minimized settlements, multi-currency, synchronized activity, summaries.
7. Trust section: data storage boundaries, encryption, payment handling boundary.
8. Accessible FAQ accordion + focused install + legal/support footer.

## Asset Rules
- Product screens use `avif`, `webp`, and `png` fallbacks.
- Use `<picture>` for responsive image selection.
- Hero image is preloaded for first paint.
- Product screenshots remain genuine. Supporting social context may be composed from
  typography, initials, color, and semantic UI elements, without stock photography.

## Non-goals
- No testimonials, no fabricated ratings or metrics, no oversized logo walls, no stock photography.
- No decorative blobs, gradients as brand treatment, or hidden content/animated reveal sections.
- No handwritten annotations or ornamental underlines. Warmth comes from people, group
  names, shared moments, and activity rather than casual type effects.
