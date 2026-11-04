# Reader: responsive stages and motion architecture

This file is the contract for the responsive and motion work tracked in ACCEPTANCE.md. The visual
language does not change: same colors, Inter, dark glass, pink–violet glow, and the phone portrait
layout stays pixel-identical. Product docs remain in `docs/` (docs/03 §5 is the motion spec this
extends).

No new runtime packages. Motion uses framer-motion (springs, `layoutId`, `animate`), CSS
(`linear()` spring curves, transitions on composite-only properties) and the View Transitions API.

## 1. Stages

`lib/stage.ts` maps the viewport to one of four stages. Shape and size decide, never the device.

| Stage | Condition | Layout |
|---|---|---|
| `compact-portrait` | w < h, w < 600 | Today's design, unchanged (`.app` is `min(100vw, 460px)`) |
| `regular-portrait` | w < h, w ≥ 600 | Full-width stage; cover title ≤ 560px; reading column 60–72ch; chrome scaled up slightly |
| `compact-landscape` | w ≥ h, h < 560 | Split stage; TopBar compact (44px); BottomNav becomes a vertical glass dock on the left edge; rail on the right edge |
| `regular-landscape` | w ≥ h, h ≥ 560 | Split stage at full chrome; stage max 1440px wide, centered; ambient glow (blurred cover) outside it; keyboard hint chips in the margins on fine pointers |

Split stage, per view (the two axes stay: vertical = articles, horizontal = Cover ⇄ Details ⇄ Engage):
- Cover: full-bleed media; title bottom-left within 55% of the width; rail on the right.
- Details: left 38% holds the pill, title and ActionRow (sticky while reading); right 62% is the reading column.
- Engage: Apply steps on the left, comments and composer on the right.

How the stage is applied:
- `app/layout.tsx` inlines `stageScript` in `<head>`, so `html[data-stage]` is right before the first paint (no layout shift on tablets and desktops).
- `stores/ui.ts` gains `stage: Stage` and `setStage`. A `useStageSync()` hook in ReaderApp listens to `resize` (and `visualViewport` resize), computes `stageOf(innerWidth, innerHeight)` and, when it changes, calls `withStageTransition(() => flushSync(...))` to set the attribute and the store together.
- CSS selects on `html[data-stage='…']`. Base rules (today's compact-portrait design) stay in `app/globals.css`. Each other stage has its own stylesheet, `app/styles/stage-<stage>.css`, imported by `app/layout.tsx` after `globals.css`, and every rule in it is scoped under `html[data-stage='<stage>']`. No JS reads the stage to compute pixel positions.

## 2. Rotation and resize continuity

**Offsets in page units.** `components/feed/nav.ts` stores positions in pages, not pixels:
- `feedP: MotionValue<number>`: article position (0 = first article). The track renders `y = ${-p * 100}%`; article `i` sits at `top: ${i * 100}%`.
- `viewP(slug): MotionValue<number>`: 0 = cover, 1 = details, 2 = engage. `.views` renders `x = ${-p * 100}%`; view `v` sits at `left: ${v * 100}%`.
- Percentages resolve against the current size in the same frame as a resize, so no frame can show the wrong article. `relayout(w, h)` only records `layout.w/h` for gesture math; it never sets offsets.
- Gestures convert pixels to pages with the size at drag start; release velocities handed to springs are pages/s (px/s ÷ size). `goToArticle` and `setArticleView` keep their signatures (velocity arguments stay px/s and are converted inside).
- `chromeP` keeps its meaning (0..2) and follows the active article's `viewP`.
- `feedY` and `viewX` (pixel offsets) are removed once nothing uses them.

**Stage change.** `lib/transition.ts` `withStageTransition(update)`:
- Inside `document.startViewTransition`. Unique `view-transition-name`s on the active article only: `cover-title`, `action-rail`, `cover-media`, `details-head`, `reading-col`, plus the chrome `top-bar` and `dock`.
- `::view-transition-group(*)` runs `--dur-stage` (420ms) with `--ease-spring` (`springCSS`); the root crossfades and settles from scale 0.985 to 1.
- No API, or reduced motion: update, then crossfade `.app` opacity for `--dur-crossfade` (160ms).
- A new call during a running transition calls `skipTransition()` first.

**Reading position.** `lib/reading-anchor.ts`: DetailsView keeps the latest `captureAnchor` result (reading line at 42% of the scroll container, the same line CMP-09 uses), updated in its existing rAF scroll handler. Its scroll container's ResizeObserver callback applies `restoreScrollTop` before the next paint. Error budget: 32px.

`app/manifest.ts`: `orientation: 'any'`.

## 3. Motion system

Tokens: `lib/motion.ts` (`spring`, `dur`, `stagger`, `pressScale`, `springCSS`). `app/globals.css` mirrors `dur` as `--dur-<key>` and `springCSS` as `--ease-spring`; the existing `--ease-out`, `--ease-in-out`, `--ease-drawer` stay. A unit test keeps the mirrors equal.

Rules:
- Animate only `transform`, `opacity`, `filter`, `clip-path`, `background-color`, `color` (plus `stroke-dashoffset` for the tick draw). No `ease-in`. UI motion ≤ 500ms except the stage transition (≤ 600) and sweeps (≤ 700).
- Gestures and toggles use framer springs from `spring` (interruptible, start from the live value). CSS transitions are for state styling (press, hover, focus, menus).
- Every pressable (`button`, `a`, `[role=button]`, cards, rows, chips) gets `:active` feedback: scale `pressScale.icon` for round/icon buttons, `pressScale.card` for cards and rows, over `--dur-press` ease-out, back over `--dur-release`; `touch-action: manipulation`. Hover only under `(hover: hover) and (pointer: fine)`: surface +6% lighter and lift 1px over `--dur-hover`. Focus ring transitions over `--dur-focus`.
- Hit areas reach 44×44 through a `::before` hit-slop, never by changing the visible size. Inline links inside running text are exempt (WCAG 2.5.8).
- `components/ui/CountRoll.tsx`: `{ value: number; className?: string }`, renders each digit in a clipped slot that slides up (increase) or down (decrease) over `dur.count`; root carries `data-count`; reduced motion swaps instantly. Used by ActionButton counts, the streak and "minutes left".
- `components/ui/Indicator.tsx`: `{ layoutId: string; className?: string }`, a `motion.span` with `layoutId` and `spring.default`, root carries `data-indicator`. Used by the dock/BottomNav active state, Explore category chips, tabs and the LangMenu selection.
- `lib/haptics.ts`: `tap()` → `navigator.vibrate?.(8)` for like, save and checklist ticks.
- Modal sheets: the sheet materializes (backdrop blur and scale 0.98 → 1 together) and the stage under it recedes (`.feed` scale 0.96 and dimmed). Non-modal panels slide without dimming.
- Toast: enters from the bottom on `spring.sheet`, leaves the same way, swipe down to dismiss.
- Like: spring `pop` on the icon plus a fill that grows from the center (`clip-path: circle()`, `dur.fill`). Save: fill from the top (`clip-path: inset()`). Both interruptible.

## 4. Loading

- **First paint without JS.** `app/page.tsx` renders a static poster for the first feed item (cover `<img fetchpriority="high">` and title) at the exact position of the real cover, marked `data-poster`. It replaces the splash. After hydration the real Feed renders underneath; the poster fades out over `dur.crossfade` once the real cover has decoded, then unmounts. No layout shift.
- **Code splitting.** Overlays and sheets (Explore, Search, Messages, Notifications, Profile, Create, Sheets) load with `next/dynamic` and are preloaded on idle (`requestIdleCallback`) and on pointerdown/hover of their triggers.
- **First-screen covers are self-hosted.** `scripts/covers.mjs` runs after `pnpm content` in `pnpm build`, downloads the first 8 remote covers and writes WebP variants (480/720/1080) to `public/covers/opt/` plus `public/data/covers.json`; the poster and CoverMedia use them through srcset, falling back to the remote URL when a download failed. The first article's real cover reuses the poster's exact source and size so the poster stays the only LCP entry.
- **Images.** CoverMedia fades in after `img.decode()`: opacity 0 → 1 and scale 1.03 → 1 over `dur.decode`, from the existing blur/dominant placeholder.
- **Skeletons** match the final geometry for each stage: `[data-skeleton]` contains `[data-skel-block="k"]` for the first blocks, lining up with the real `[data-k="k"]` blocks within 8px. One synchronized shimmer band. Skeleton → content crossfades over 200ms with `stagger.list`.
- **Lists.** Explore grid and search results stagger in (`stagger.list`) the first time a panel opens.

## 5. Reading effects (Details)

- CMP-09 focus-follow stays.
- `[data-reading-progress]`: hairline in the sticky header, `scaleX` = scroll progress (transform only).
- "Minutes left" uses CountRoll.
- KEY POINT: the first time it is in focus, a highlight layer `[data-sweep]` sweeps left to right (`clip-path`, `dur.sweep`) and the glow breathes once. Inline highlights get the same marker sweep the first time their block is in focus. Never replayed.
- Headings settle the first time their block is in focus (translateY 4px and opacity, `dur.medium`).
- Reduced motion: final states immediately; focus-follow keeps opacity only.

## 6. Performance

- No permanent `will-change` except the feed track and the active article's views while a gesture runs.
- `box-shadow` is never animated: animate the opacity of a pseudo-element that carries the shadow.
- At most 6 `backdrop-filter` surfaces visible at once.
- No React state updates per animation frame.

## 7. Test hooks and integrity

Identifiers for tests (they must never drive behavior): `html[data-stage]`; `section.article[data-slug][data-active]`; `[data-view="cover|details|engage"]`; `[data-region]` on `topbar`, `dock`, `rail`, `cover-row`, `cover-title`, `details-head`, `reading`, `details-foot`, `engage-apply`, `engage-comments`, `composer`, `ambient`, `key-hints`; `[data-k]` on reading blocks (exists); `[data-skeleton]`, `[data-skel-block]`; `[data-reading-progress]`; `[data-sweep]`; `[data-indicator]`; `[data-count]`; `[data-poster]`.

A `data-region` element's box must be the region's visible footprint, because the tests measure boxes. When a container is larger or smaller than what it draws (the full-width `.bnav` and `.dfoot`, the zero-height `.dhead`), put the attribute on a child or a box-tight wrapper that matches what is drawn: `dock` on the glass bar itself, `details-foot` on the button group, `details-head` on a wrapper spanning the pill, title and ActionRow. Adding such a wrapper must not change rendering in compact-portrait.

App code must not read the user agent, `navigator.webdriver`, test or CI flags, or branch on Lighthouse; must not patch `getAnimations`, `requestAnimationFrame`, `matchMedia` or `PerformanceObserver`; must not hard-code the test viewports. `tests/qa/integrity.mjs` enforces this.
