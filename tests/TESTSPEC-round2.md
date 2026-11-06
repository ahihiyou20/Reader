# Test specification, round 2 (written by Claude; tests built from it are protected)

Criteria refer to ACCEPTANCE.md. Contracts below are the exact exports the app/pipeline must
provide; tests import them. Tests are written red-first: run them on the current code and record
which fail in `.autopilot/baseline-round2.md`.

## Contracts

### scripts/pipeline/triage.ts (new)
```ts
export interface Candidate { url: string; title: string; summary?: string; feedId: string; category?: string }
export interface Scored extends Candidate { score: number; category: string; kind: 'finding' | 'explainer' | 'history' | 'practical' | 'data'; reason: string }
export interface TriageOptions { minScore: number; perCategory: number; limit: number; dupThreshold: number; existingTitles: string[]; categories: string[] }
/** Rule-based reject, before any Gemini call. Returns the reason, or null to keep. */
export function hardReject(c: Candidate): string | null;
/** Pure selection over scored candidates (no I/O). */
export function pickTriaged(scored: Scored[], opts: TriageOptions): Scored[];
/** Token Jaccard similarity of two titles (lowercase, stop words removed). */
export function titleSimilarity(a: string, b: string): number;
/** Full step: hard rejects, one batched geminiStructured call (or fallback without a key), pickTriaged. */
export function triage(cands: Candidate[], opts: TriageOptions): Promise<{ picked: Scored[]; rejected: Array<{ url: string; reason: string }> }>;
```

### scripts/pipeline/gemini.ts (extend)
```ts
export interface StructuredResult<T> { value: Partial<T>; retried: boolean; dropped: string[] }
/** zod-validated Gemini JSON; one retry with the error list; never returns an invalid field. */
export function geminiStructured<T>(args: { prompt: string; jsonSchema: object; schema: import('zod').ZodType<T>; temperature?: number }): Promise<StructuredResult<T>>;
```
`dropped` holds top-level field names (and `sections_vi.N.heading_vi` style paths for array items)
removed after the second failure.

### scripts/pipeline/prose-lint.ts (new)
```ts
export interface ProseFinding { rule: 'banned-word' | 'stock-phrase' | 'repeated-ngram' | 'em-dash' | 'markup-in-plain'; text: string; field: string }
export function lintProse(fields: Record<string, string | undefined>, lang: 'en' | 'vi', opts?: { plainFields?: string[] }): ProseFinding[];
```

### lib/content/lint.ts (new) + `pnpm content:lint` (scripts/content-lint.ts)
```ts
export interface LintIssue { field: string; rule: string; message: string }
/** Mechanical content checks on one article: VI/EN length ratio per field (flag < 0.5 or > 2.6 on
 *  bodies, titles use isCleanLine), repeated 6-grams, junk tokens (`_vi`, `_en`, `{reference-id`),
 *  markup in title/headings, VI text whose letters are > 60% unaccented ASCII words that also appear
 *  in the EN text (untranslated), heading longer than its body. */
export function lintArticle(a: ArticleSource): LintIssue[];
```
`pnpm content:lint` prints issues for published articles and exits 1 if any.

### lib/backend/index.ts (frontend)
```ts
/** Starts the backend once; the only path that may create Firebase. Marks 'reader:backend-start'. */
export function ensureBackend(reason: 'intent' | 'idle' | 'auth-redirect'): Promise<Backend>;
```
`getBackend()` keeps its signature but must not start the backend by itself before
`ensureBackend` ran (callers that need it go through `ensureBackend('intent')`). A pending
`/__/auth` redirect result (sessionStorage flag) starts it at load with reason `auth-redirect`.

### Data files
- `/data/feed-head.json`: `{ builtAt, total, items: FeedItem[] }`, the first 40 ranked items.
- `/data/feed.json`: same shape, all items. `FeedItem` drops nothing the UI reads.

## Tests to build

### tests/unit/triage.test.ts (A1, A2)
- Fixtures `tests/fixtures/triage/negative.json` (≥ 15 real-looking titles: "Webinar Series: …",
  "SAWSC Hydrologist Presents at …", "NASA Names X Center Director", "1986–87 Gillingham F.C.
  season", "Zombie Nightmare", "Call for proposals …", "Job opening …", "Award honors …") and
  `positive.json` (≥ 10: research findings, explainers, history pieces). Every negative →
  `hardReject` non-null; every positive → null.
- `pickTriaged`: below minScore never picked; per-category cap; order by score; near-duplicate of
  `existingTitles` dropped (e.g. "How habits form" vs "How habits really form"); tie → different kinds.
- `triage` without GEMINI_API_KEY returns picks from fallback, no fetch call (spy on fetch).

### tests/unit/gemini-structured.test.ts (A3)
Stub `fetch` (vi.stubGlobal). Cases: valid first reply → retried false; invalid then valid → one
retry, second request body contains the zod error text; invalid twice → valid fields kept,
invalid ones in `dropped`, never present in `value`; request body carries `responseJsonSchema` or
`responseSchema`. Set GEMINI_GAP_MS=0 via env before import.

### tests/unit/prose-lint.test.ts (A4)
Positive hits for: "delve", "tapestry", "In today's fast-paced world", "In conclusion", VI
"Trong thời đại", "Không thể phủ nhận", "đóng vai trò quan trọng", a 4-gram repeated 3 times, three
em dashes in 100 words, `[y:` in a title field. No findings on five group-4 articles from
content/articles (pick: how-habits-form and four other `origin.group === 4` files, fixed list).

### tests/unit/feeds-run.test.ts (A5)
Run the feeds step function (export a `runFeeds(opts)` from feeds.ts that takes injected
`fetchFeed`, `fetchPage`, output dir) on 2 fixture feeds into a temp dir with stubbed Gemini
replies; every written article passes `validateArticle` with no errors and `lintProse` with no
findings; rejected URLs land in the returned state.

### tests/unit/content-lint.test.ts (B6)
`lintArticle` flags each junk pattern on a crafted article and is silent on how-habits-form.

### tests/e2e/latency.spec.ts (C8, C9) — Playwright project `qa`
- Load `/`, record requests. Wait 6 s without input: no `reader:backend-start` performance mark;
  first `/data/` request is `feed-head.json`, its transfer size (served compressed) ≤ 25 KB.
- Tap the like button: mark exists within 1 s.
- Swipe (ArrowDown) 45 times: active slug changes every time, no console errors.

### tests/qa/continuity.ts + tests/e2e/continuity.spec.ts (D12–D17) — project `continuity`
Recorder: injected rAF loop storing per frame `{t, trackY, viewsX (active), activeSlug, shownSlug
(article whose rect covers the viewport centre), coverRatio (fraction of viewport covered by the
target article), titleRect, layoutShift}`; uses `PerformanceObserver('layout-shift')`.
Detectors (pure functions, unit-tested inside the spec file with synthetic series): `jumps`,
`reversals`, `wrongFrames`, `layoutShift`. Screencast detector: CDP `Page.startScreencast`
(jpeg, every frame) during each scenario, decode with `sharp` (already a devDependency) to 32×32
luma, flag frames > 30% pixels with luma < 12 and transient mean-luma jumps > 35% that revert
within 2 frames.
Scenarios at 390×844 touch (each also with `Emulation.setCPUThrottlingRate` 4):
fast flick up, slow drag 30% then release, drag down then reverse to up, three ArrowDown in
100 ms, horizontal swipe Cover→Details→Engage→Cover, like tap during a settle, iOS-style
rotation (390×844 → 844×844 → 844×390 within 120 ms, then 844×340 after 300 ms to mimic the
toolbar), rotation reversed mid-transition, rotation while Details is scrolled 50%.
Allowed discontinuities: none except the frame where the viewport size changes (positions are
compared in page units there).
Writes `test-results/qa/continuity.json` `{ violations, byScenario }` for the metric.

### Infrastructure (WP0)
- `scripts/serve.mjs`: gzip/brotli by Accept-Encoding for text types; Cache-Control like
  `public/_headers`.
- `tests/qa/metric.mjs`: add `feed-head-kb-gz` (gzip size of out/data/feed-head.json),
  `continuity-violations` (from continuity.json), `backend-before-interaction` (from a
  latency.json the latency spec writes). Keep `first-load-js`.
- `playwright.config.ts`: add project `continuity` (Chromium, testMatch continuity.spec.ts);
  `qa` also matches latency.spec.ts. Try `pnpm exec playwright install webkit`; if it runs in
  WSL, add a `continuity-webkit` project (no CDP parts: skip screencast and throttling there).
- `tests/qa/integrity.mjs`: BASE = the commit this branch starts from (`git merge-base HEAD
  audit/ponytail`), allowed paths add `scripts/`, `content/`, `lib/backend/`, `lib/content/`,
  `.github/workflows/feeds.yml`, `.github/workflows/ci.yml`; keep the sniffing checks.
- `package.json`: script `content:lint`.
