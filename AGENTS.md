# Reader: notes for coding agents

Reader is a static-export Next.js 15 PWA (React 19, framer-motion 12, zustand, plain CSS in
`app/globals.css`, Tailwind v4 present but layout lives in CSS). Dark theme only. Product docs are in
`docs/`; the motion spec is docs/03 §5. The current responsive and motion work is defined by
`ARCHITECTURE.md` and `ACCEPTANCE.md` at the repo root.

## Commands
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest), `pnpm build` (content + next build + service worker into `out/`).
- `pnpm exec playwright test` runs e2e against `out/` (build first). Chromium 1194 is installed with `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` because this machine runs Ubuntu 26.04.
- Serve the build: `PORT=4173 node scripts/serve.mjs out`.

## Conventions
- TypeScript strict, no `any`. Client components start with `'use client'`.
- Motion values live in framer `MotionValue`s, never in React state per frame. Reuse `lib/motion.ts` (`spring`, `springFor`, `dur`, `stagger`, `pressScale`, `springCSS`, `rubberClamp`, `sampleVelocity`, `pickPage`) instead of new helpers.
- Animate only transform, opacity, filter, backdrop-filter, clip-path, background-color, color (and stroke-dashoffset for the checklist tick). No `ease-in`. Respect `prefers-reduced-motion`.
- Layout per stage lives under `html[data-stage='…']` selectors (ARCHITECTURE.md §1). Do not branch on the user agent or device.
- Comments explain why, not what. No dead code, commented-out code, unused imports or debug logs.

## antigravity-master run (Claude conducts, Gemini builds)
- Stay inside the delegation prompt's scope. Contracts (`lib/stage.ts`, `lib/reading-anchor.ts`, `lib/transition.ts`, the tokens in `lib/motion.ts`, ARCHITECTURE.md) are fixed: if one is wrong, write DISAGREE with evidence in your digest instead of working around it.
- Never edit tests or test helpers after they are handed over (`tests/**`, `playwright.config.ts`, `vitest*.config.ts`), `.autopilot/`, `package.json`, `pnpm-lock.yaml`, `eslint.config.mjs`, `tsconfig.json`, `content/`, `scripts/`, `lib/backend|content|server/`, `functions/`, `firestore*`, `.github/`, `.claude/`, or anything in `node_modules`.
- Never add environment sniffing (user agent, `navigator.webdriver`, CI or test flags, Lighthouse), never patch browser APIs, never hard-code test viewport sizes, never hide content or lazy-load the LCP image to move a metric.
- Before reporting done: run the self-check commands from the prompt and `code-graph-mcp dead-code <paths you changed>`; fix what you introduced. Reply with a digest only: files changed, key decisions, commands with pass/fail, DISAGREE items, open questions.
- No git push, deploy, messages, purchases or credentials; nothing deleted outside the project.
