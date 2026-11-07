# Acceptance criteria, round 2: smarter bot, clean content, lower latency, visual continuity

Round 1 criteria (responsive stages, rotation, micro-interactions, loading, reading effects) stay
enforced by the existing e2e suite (E20). Each line names its check.

## A. Content bot (scripts/pipeline)

1. `hardReject()` rejects every negative fixture (webinar/event notice, "presents at", personnel
   appointment, sports season, film/album/TV episode, award/grant notice, job ad, title under 4
   words with no summary) and passes every positive fixture. `tests/unit/triage.test.ts`
2. `pickTriaged()` never picks a candidate below `minScore`, takes at most `perCategory` per
   category, prefers higher scores, mixes `kind`s when scores tie, and drops near-duplicates of
   existing titles (token Jaccard ≥ `dupThreshold`). Without a Gemini key, `triage()` falls back to
   hard rejects + round-robin. `tests/unit/triage.test.ts`
3. `geminiStructured()`: a reply that fails the zod schema is retried once with the error list in
   the prompt; a second failure keeps the valid fields and reports the dropped ones; an invalid
   value is never returned. Sends `responseJsonSchema` (or `responseSchema` if the API rejects it).
   `tests/unit/gemini-structured.test.ts` (fetch stubbed)
4. `lintProse()` flags banned words and stock phrases (EN and VI lists), repeated 4-grams, more
   than one em dash per 150 words, and markup in plain fields; it reports nothing on five good
   group-4 articles. `tests/unit/prose-lint.test.ts`
5. One `feeds.ts` run on fixture feeds with a stubbed Gemini writes articles that pass
   `validateArticle` and `lintProse`, and records rejected links in the feed state.
   `tests/unit/feeds-run.test.ts`

## B. Content

6. `pnpm validate` reports 0 errors and `pnpm content:lint` reports 0 errors on published articles.
7. Every category keeps ≥ 12 published articles; `docs/content-triage-2026-11.md` lists each
   demoted slug with score and reason. Reviewer check on a sample of 20.

## C. Latency

8. No backend start (`performance.mark('reader:backend-start')`) within 6 s after load without
   input; the mark exists within 1 s after a like tap. `tests/e2e/latency.spec.ts`
9. The first data request is `/data/feed-head.json` ≤ 25 KB gzip whatever the article count; the
   full feed loads after first paint; swiping past item 40 stays continuous.
   `tests/e2e/latency.spec.ts` + metric `feed_head_kb_gz`
10. First Load JS of `/` ≤ 165 kB. Metric `first_load_js_kb`
11. Lighthouse on the local server with compression: mobile perf ≥ 85, desktop ≥ 95;
    accessibility 100, best practices 100, SEO ≥ 95. Gate `lighthouse`

## D. Visual continuity

12. No position jump: no frame step > max(48 px, 3× the gesture's median step) outside an allowed
    discontinuity. `tests/e2e/continuity.spec.ts`
13. No direction reversal during settle beyond one spring overshoot. `continuity.spec.ts`
14. No wrong or empty frame: the target article covers ≥ 99% of the viewport and the shown slug
    is the start or target slug on every frame. `continuity.spec.ts`
15. No black or flash frame (CDP screencast, CPU 4×): no frame > 30% near-black, no mean-luma jump
    > 35% that reverts within 2 frames. `continuity.spec.ts`
16. Zero layout shift during gestures and rotations. `continuity.spec.ts`
17. Items 12–16 hold at normal speed and at CPU throttling 4×. `continuity.spec.ts`
18. WebKit (Linux or Windows Playwright): same scenarios, 0 jumps and 0 wrong frames. Reviewer
    check, logged in CINEMA-QA.md
19. Edge on the Windows GPU: frame p95 ≤ 20 ms, 0 long tasks. `tests/qa/edge-perf.mjs`

## E. Integrity

20. Existing unit, rules and e2e tests pass; any test changed because the architecture changed is
    approved line by line by Claude with the reason in the report.
21. Phone portrait baselines match within 2% (`tests/e2e/visual.spec.ts`).
22. `tests/qa/integrity.mjs`: no test-environment sniffing, no edits to node_modules or protected
    files, changes only in allowed paths.
23. Gemini and Claude reviews ≥ 8; changed prose passes avoid-ai-writing.
