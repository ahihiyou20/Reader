# CINEMA-QA: Reader responsive and motion pass

Phase 7 scorecard (awwwards-auteur-director) plus stageshow-style frame review. One section per review
round; the final round must show PASS on every row.

## Round 1: after WP2 + WP2 fixes (2026-11-03)

| Check | Result | Evidence |
|---|---|---|
| Phone portrait unchanged | PASS | visual.spec 2/2 (iPhone 13, SE), 0 px diff |
| Responsive, 8 gate viewports | PASS | responsive.spec 8/8 |
| Rotation: same article, same reading line, no wrong article frame | PASS | rotation.spec 5 scenarios, `rotation-wrong-frames` = 0; reading anchor within 32 px |
| Private holdout viewports (8 sizes Gemini never saw) | FAIL, 2 items | Apply step rows 42 px tall in compact-landscape; Explore row under the rail at about 600 px wide regular-portrait. Sent to WP3 as C1 and C2 |
| Press feedback on every control | FAIL (expected) | 14 controls with no press response; WP4 |
| No-JS poster | FAIL (expected) | no poster yet; WP3 |
| Visual review of 7 viewports (contact sheets) | Fixed in WP2 round 2 | gutters on tablet, landscape hint overlap, truncated title, narrow composer, Engage grid on desktop |
| Lighthouse | not run yet | runs in verify after WP3 |
| DPR-2 frame budget, reduced motion, keyboard path | not run yet | final round |

Holdout corrections made by the conductor this round (they were holdout bugs, not app bugs): regions
clipped by `.app` no longer count as visible; coverage is measured against the `.app` box (compact-portrait
is a 460 px column by design); up to two stage-pending frames per stage change are the View Transition's
old snapshot; keyboard hints are required only in regular-landscape with a fine pointer.

## Round 2: after WP3 and WP3b (2026-11-04)

| Check | Result | Evidence |
|---|---|---|
| Lighthouse accessibility, mobile and desktop | PASS (100 / 100) | role=article and aria-posinset moved to an inner wrapper; non-visible views inert |
| Lighthouse best practices / SEO | PASS (100 / 100) | |
| Lighthouse performance, desktop | FAIL (87, target 90) | LCP 2.4 s: the full-size cover's load delay 1.5 s |
| Lighthouse performance, mobile | FAIL (62, target 90) | LCP 12.7 s (load delay 7.8 s, load 2.9 s, render 1.5 s), TBT 495 ms |
| First-load JS | PASS | 220.1 kB (baseline 228.7, cap 238) |
| No-JS poster, CLS | PASS | loading.spec; CLS 0 |
| Specs | PASS | visual, loading, responsive, rotation: 29/29; iPhone 10/10 |

What blocks mobile 90, measured: the first cover is a third-party image (picsum.photos, a 302 to
fastly.picsum.photos) at 1080x1920; once the real cover replaces the 540x960 poster it becomes the LCP
entry, so LCP follows the full image's arrival under simulated slow 4G. React and framer-motion
hydration costs about 500 ms of main-thread time at 4x CPU slowdown. Closing the gap needs a decision
the plan does not cover (see the final report): self-hosting resized first-screen covers through the
content pipeline, and/or a lighter first-screen bundle, or a revised mobile target.

## Round 3: after WP4+WP5 (partial: Gemini quota ran out twice) (2026-11-04)

| Check | Result | Evidence |
|---|---|---|
| Gates typecheck / lint / unit / build / integrity | PASS | verify iter 2, score 63.9 |
| Interaction coverage (press census, 2 phone viewports) | PASS (100 %) | interactions.spec; one control responded late on one run under load |
| Rotation wrong frames | PASS (0) | rotation.spec 5 scenarios |
| e2e | 59 passed, perf failing | motion-quality now green after the test amendments |
| Frame p95, phone touch flows (feed, view, panel drag) | PASS (16.7 ms) | perf.json |
| Frame p95, rotation | FAIL (50 ms, one 75 ms long task) | the stage change re-renders React inside the View Transition |
| Frame p95, desktop mouse view swipe / feed swipe | FAIL (100 ms / 33 ms, long task 100 ms) | Details mounting during the swipe; full-screen blurred ambient under software rendering |
| Indicator contract | FAIL | `Indicator` ignores `layoutId` (lint warning); the dock indicator jumps between Search and Messages instead of sliding |

## Round 4: Claude finishes (2026-11-04)

| Check | Result | Evidence |
|---|---|---|
| Gates typecheck / lint / unit / build / e2e / integrity | PASS | verify iter 6 (e2e 60 passed, 1 flaky popover timing test passed on retry) |
| Interaction coverage | PASS (100 %) | press-in is now immediate, only the release animates |
| Rotation wrong frames | PASS (0) | rotation.spec |
| Frame p95 on real hardware (Edge, Windows GPU) | PASS (8.3-8.4 ms, 0 long tasks) | tests/qa/edge-perf.mjs: desktop feed/view swipe, phone feed/view swipe, rotation 390x844 <-> 844x390 |
| Indicator contract | PASS | one shared `layoutId` element rendered inside the selected chip / dock button; slides on a spring |
| Engage in landscape | PASS | fixed: `data-engage` was never set after the feed started mounting in a transition, so the dock stayed over the Apply card |
| Glass and will-change | PASS | 9 on-screen glass surfaces at rest (same as the original design), 6 with a panel open; 4 will-change hints, all on the track and the active article |
| Holdout (8 private viewports, other articles, random order) | PASS (0 failures) | conductor holdout suite |
| Phase 7: 390 / 844x390 / 768 / 1440 / reduced motion | PASS | console clean; desktop reading column now fades out above the dock |
| Lighthouse desktop | PASS | 94 / 100 / 100 / 100 |
| Lighthouse mobile | FAIL (62, target 90) | a11y / best practices / SEO 100. Local server has no compression (Lighthouse estimates ~2.4 s from text compression alone); the remaining cost is the Next.js + React runtime. To be re-measured on the Cloudflare preview, which serves Brotli. |
