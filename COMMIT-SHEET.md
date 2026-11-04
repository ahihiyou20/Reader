# COMMIT-SHEET: Reader responsive and motion pass

Register: `system` (existing multi-screen product). Phases 1, 2, 6 and 7 of awwwards-auteur-director apply;
Phase 4 (Nuxt/Drizzle) does not apply to this Next.js app. Stageshow's craft rules (restraint, spacing and
alignment, every motion has a cause, content moves instead of swapping, rehearse with frame contact sheets)
apply to every screen and review. Where the two skills disagree, awwwards wins; where either disagrees with
the existing design the user asked to keep, the plan wins and the exception is written down here.

## Phase 1 recon (2026-11-03)

- Context7: framer-motion 12, React 19 `flushSync`, View Transitions API, Next.js 15 static export are
  read per work package by the builder; signatures are checked against `node_modules` types.
- Awwwards index (2,976 sites, fresh). No reading or editorial app winners exist in the index; the closest
  mobile-app SOTD winners are Elva, Butter and Potion (marketing sites). Motion DNA was captured live after
  installing Playwright globally for awwwards-mcp (2026-11-04):
  - Apple Books (apple.com/apple-books): hover changes only `color` / `background-color`, never position;
    320 ms on `cubic-bezier(0.4, 0, 0.6, 1)`; motion otherwise CSS keyframes and SMIL, median 320 ms.
  - Butter (SOTD): Lenis; dominant easing `cubic-bezier(0, 0, 0, 1)` (23 uses), a very strong ease-out;
    durations median 800 ms (marketing reveals, not UI state).
  - Elva (SOTD): WebGL scene, no UI motion vocabulary to borrow.
- Decisions from the evidence: strong ease-out for UI state (our `--ease-out` 0.23, 1, 0.32, 1 sits with
  Butter's curve); hover duration stays at the awwwards floor (150 ms, it wins over Apple's 320 ms by the
  user's priority rule); hover on icon buttons, pills and rows changes only the surface color (Apple's
  restraint), and only cards (Explore grid, list cards) also lift 1 px.

## Phase 2 commitments

**Grammar: split-stage.** In landscape, tablet and desktop the stage is split: a pinned left column (the
article's identity: pill, title, actions; or the Apply steps) and a scrolling right column (the reading
column; or the comments). Phone portrait keeps today's single-column two-axis feed unchanged.

Fingerprint (first build of this kind in the workspace, so the gate is a record, not a comparison):
1. Grammar: split-stage (above).
2. Navigation: two-axis feed (vertical = articles, horizontal = Cover / Details / Engage); in landscape the
   BottomNav becomes a vertical glass dock on the left edge, the action rail sits on the right edge.
3. Hero mechanics: the cover itself, full-bleed media with the title bottom-left; on desktop an ambient
   blurred copy of the cover fills the margins.
4. Device families per surface: full-bleed media (Cover), pinned column + reading column (Details),
   checklist + thread (Engage), sheets and panels (overlays). No two adjacent views share a device.
5. Feeling curve: Cover = curiosity (big image, one line of title); Details = focus (one block lit, the
   rest receding, a progress hairline); Engage = agency (ticks that draw, a comment that flies into the
   list). One primary peak: the rotation morph.
6. Signature move: **the stage morph.** Turning the phone (or resizing the window across a stage) keeps the
   same article and the same reading line, and the named pieces (cover title, rail, media, dock, top bar,
   Details head, reading column) travel from their portrait positions to their split-stage positions on a
   spring (420 ms, critically damped), while the stage settles from 0.985 to 1. Close: the EndCard at the
   end of the feed, reached with the same vertical throw as every article.

### Tokens (locked to the existing design; nothing new is introduced)

| Role | Value | Note |
|---|---|---|
| Ground primary | `--bg` #0b0b0f (OKLCH ~0.15 0.01 285) | not pure black |
| Ground elevated / surface | glass: white 6-12% over the ground with `backdrop-filter` | see exception G1 |
| Text primary | `--fg` #fff | 19:1 on ground |
| Text secondary | `--fg2` white 72%, `--fg3` 52% | fg2 for body-adjacent text; fg3 only for large or meta text |
| Brand accent | `--pink` #ff3d8b, with `--violet` #8b5cf6 in the brand gradient | see exception P1 |
| Hairline | white 8-12%, 1px | |

Typography: one family, Inter (variable `--font-sans`), see exception T1. Body 15.5px/26px in
compact-portrait (unchanged), at least 16px elsewhere; reading measure 60-72ch in regular stages (45-75ch
hard limits); display titles use `clamp()` and stay under 6rem. Tracking tightens on large titles only.

Spacing: 4px base. Fluid gutters with `clamp()`: 16px on phones, 24-32px on tablets, the 1440px stage on
desktop. More space above a heading than below it.

Depth tools: (1) offset shadows on floating chrome carried by a pseudo-element whose opacity animates;
(2) 1px top edge highlight on glass; (3) scale-and-dim distance planes for modal sheets (the feed recedes
to 0.96 and darkens); (4) structural overlap: the title over the cover media, the dock over the stage edge;
(5) no film grain (it would fight the cover photography).

Motion floor (from the numeric craft rubric): press-in immediate (a transition's first frame always shows its start value, so a 120 ms press read as no response on the first two frames; native highlights are immediate too) / release 200 ms, hover 150 ms (surface color only; cards also lift 1 px), focus 120 ms,
popovers 180 ms in / 120 ms out, sheets on springs, stage morph 420 ms, KEY POINT sweep 600 ms (written
reason: a reading cue that plays once per article, longer than UI state changes on purpose). Ease-out
`cubic-bezier(0.23, 1, 0.32, 1)` or springs; no ease-in. Composite-only properties.

### Named anti-references (banned)

1. News-app list mode: a vertical stack of identical thumbnail + headline + excerpt cards.
2. Gray pulsing placeholder rectangles that do not match the content's geometry, and spinners.
3. Scroll parallax on the cover photograph (the team removed it on purpose, docs/08).

## Phase 6 exceptions (auteur-allow)

The existing design the user asked to keep uses three patterns the gate bans by default. They stay, each
marked in CSS with `/* auteur-allow: RULE_ID -- reason */` where it is declared:

- G1 `NO_DEFAULT_GLASSMORPHISM`: the frosted glass is Reader's chrome material (top bar, dock, rail, pills,
  sheets), not a card style; it sits over full-bleed photography where it has a job. Budget: at most 6
  visible `backdrop-filter` surfaces.
- P1 `NO_AI_PURPLE_GRADIENT`: `--grad-brand`, `--grad-cta` and `--grad-engage` are the brand's existing
  gradients (pink to violet to blue). They stay on the surfaces that already use them; no new purple-blue
  gradients are added anywhere.
- T1 `NO_REFLEX_SANS`: Inter is the shipped brand typeface; replacing it is out of scope.

Every other rule applies as written, including `NO_TRANSITION_ALL`, `NO_SCALE_ZERO_ENTRANCE` (entrances
start at 0.95-0.96 with opacity 0), `NO_MONOTONE_FADE_UP` (reveals differ by content: clip-path sweep for
KEY POINT, line settle for headings, crossfade for skeletons, FLIP for new comments) and
`NO_RAW_SCROLL_LISTENER` (the Details reader keeps its single existing rAF-throttled scroll handler on its
own scroll container; no window scroll listeners are added).

## Phase 7 gate (every review round)

Run on the production build (`pnpm build`, served from `out/`), never a dev server:
1. Playwright MCP: accessibility snapshot, every control named, Tab path with visible focus rings, console
   and network clean.
2. Viewports 390x844, 844x390, 768x1024, 820x1180, 1440x900 (plus the private holdout set): no overflow,
   titles at most 4 lines on phones, 44x44 targets, no overlap.
3. Frame budget at 1440x900 DPR 2 while driving the feed and the Details scroll: avg >= 55 fps.
4. Reduced motion and no-JS: every state readable, the static poster visible without JavaScript.
Results go to `CINEMA-QA.md`.
