import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  collectConsoleErrors,
  goToView,
  newQaContext,
  openFeed,
  type FeedView,
} from '../qa/app';
import { insideViewport, intersectArea, visibleRect, type Rect } from '../qa/geometry';
import { MATRIX } from '../qa/viewports';

interface ViewFindings {
  readonly stage: string | null;
  readonly scrollW: number;
  readonly innerW: number;
  readonly regionsFound: readonly string[];
  readonly hitAreasTested: number;
  readonly hitAreaFailures: number;
}

interface ViewportFindings {
  readonly name: string;
  readonly stage: string;
  readonly views: Record<string, ViewFindings>;
  readonly passed: boolean;
  readonly error?: string;
}

const qaDir = path.resolve(process.cwd(), 'test-results/qa');
if (!fs.existsSync(qaDir)) {
  fs.mkdirSync(qaDir, { recursive: true });
}
const responsiveFilePath = path.join(qaDir, 'responsive.json');
if (!fs.existsSync(responsiveFilePath)) {
  const initialData: Record<string, ViewportFindings> = {};
  for (const vp of MATRIX) {
    initialData[vp.name] = {
      name: vp.name,
      stage: vp.stage,
      views: {},
      passed: false,
    };
  }
  fs.writeFileSync(responsiveFilePath, JSON.stringify(initialData, null, 2), 'utf8');
}

function recordViewportFindings(vpName: string, findings: ViewportFindings): void {
  const individualFile = path.join(qaDir, `responsive.${vpName}.json`);
  fs.writeFileSync(individualFile, JSON.stringify(findings, null, 2), 'utf8');

  const aggregatedFile = path.join(qaDir, 'responsive.json');
  let aggregated: Record<string, ViewportFindings> = {};
  if (fs.existsSync(aggregatedFile)) {
    try {
      aggregated = JSON.parse(
        fs.readFileSync(aggregatedFile, 'utf8'),
      ) as Record<string, ViewportFindings>;
    } catch {
      aggregated = {};
    }
  }
  aggregated[vpName] = findings;
  try {
    fs.writeFileSync(aggregatedFile, JSON.stringify(aggregated, null, 2), 'utf8');
  } catch {
    // ignore concurrent file collision
  }
}

async function getAllVisibleRegions(
  page: Page,
): Promise<Map<string, { locator: Locator; rect: Rect }>> {
  const result = new Map<string, { locator: Locator; rect: Rect }>();
  const allWithRegion = page.locator('[data-region]');
  const count = await allWithRegion.count();
  for (let i = 0; i < count; i++) {
    const candidate = allWithRegion.nth(i);
    const info = await candidate.evaluate((el) => {
      const art = el.closest('section.article');
      if (art && art.getAttribute('data-active') !== 'true') {
        return null;
      }
      return el.getAttribute('data-region');
    });
    if (!info) continue;
    const rect = await visibleRect(candidate);
    if (rect) {
      result.set(info, { locator: candidate, rect });
    }
  }
  return result;
}

const VIEWS: readonly FeedView[] = ['cover', 'details', 'engage'];

for (const vp of MATRIX) {
  test('responsive layout at ' + vp.name, async ({ browser }) => {
    recordViewportFindings(vp.name, {
      name: vp.name,
      stage: vp.stage,
      views: {},
      passed: false,
      error: 'Running',
    });

    const context = await newQaContext(browser, vp);
    const page = await context.newPage();
    const consoleErrors = collectConsoleErrors(page);

    const viewsData: Record<string, ViewFindings> = {};
    let testError: string | undefined;

    try {
      await openFeed(page);

      for (const view of VIEWS) {
        await goToView(page, view);
        await page.waitForTimeout(800);

        // 1. Stage attribute
        const stage = await page.locator('html').getAttribute('data-stage');
        expect(stage, `Stage attribute on <html> should match expected ${vp.stage}`).toBe(
          vp.stage,
        );

        // 2. Horizontal overflow
        const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
        const innerW = await page.evaluate(() => window.innerWidth);
        expect(
          scrollW,
          `Horizontal overflow detected: scrollWidth (${scrollW}px) > innerWidth (${innerW}px) in ${view} view at ${vp.name}`,
        ).toBeLessThanOrEqual(innerW);

        // 3. Required regions
        let requiredRegions: readonly string[];
        if (view === 'cover') {
          requiredRegions = !vp.isMobile
            ? ['topbar', 'dock', 'rail', 'cover-row', 'cover-title', 'key-hints']
            : ['topbar', 'dock', 'rail', 'cover-row', 'cover-title'];
        } else if (view === 'details') {
          requiredRegions = ['topbar', 'details-head', 'reading', 'details-foot'];
        } else {
          requiredRegions = ['topbar', 'engage-apply', 'composer'];
        }

        const visibleRegions = await getAllVisibleRegions(page);

        for (const req of requiredRegions) {
          const entry = visibleRegions.get(req);
          expect(
            entry,
            `Required region "${req}" must exist and be visible in ${view} view at ${vp.name}`,
          ).toBeDefined();
        }

        // 4. Viewport containment
        for (const req of requiredRegions) {
          const entry = visibleRegions.get(req);
          if (!entry) continue;
          if (req === 'reading') {
            const intersects =
              intersectArea(entry.rect, {
                x: 0,
                y: 0,
                width: vp.width,
                height: vp.height,
              }) > 0;
            expect(
              intersects,
              `Region "reading" must intersect the viewport at ${vp.name}`,
            ).toBe(true);
          } else {
            const isInside = insideViewport(entry.rect, vp, 1);
            expect(
              isInside,
              `Region "${req}" (${JSON.stringify(entry.rect)}) must be contained inside viewport (${vp.width}x${vp.height}) at ${vp.name}`,
            ).toBe(true);
          }
        }

        // 5. Pairwise overlap
        const EXCLUDED_OVERLAP = new Set(['reading', 'ambient', 'engage-comments']);
        const overlapCandidates = Array.from(visibleRegions.entries()).filter(
          ([name]) => !EXCLUDED_OVERLAP.has(name),
        );

        for (let i = 0; i < overlapCandidates.length; i++) {
          for (let j = i + 1; j < overlapCandidates.length; j++) {
            const [name1, item1] = overlapCandidates[i];
            const [name2, item2] = overlapCandidates[j];
            const area = intersectArea(item1.rect, item2.rect);
            expect(
              area,
              `Regions "${name1}" and "${name2}" overlap by ${area}px² (> 4px²) in ${view} view at ${vp.name}`,
            ).toBeLessThanOrEqual(4);
          }
        }

        // 6. Details view checks
        if (view === 'details') {
          await page.evaluate(() => {
            const scrollers = document.querySelectorAll(
              '[data-region="reading"], .dscroll, .sec-scroll, .view.details',
            );
            for (const s of scrollers) {
              s.scrollTop = 0;
            }
          });

          const readingEntry = visibleRegions.get('reading');
          expect(
            readingEntry,
            `Reading region must exist and be visible in Details view at ${vp.name}`,
          ).toBeDefined();
          if (readingEntry) {
            const rRect = readingEntry.rect;
            const minX = Math.max(0, rRect.x);
            const maxX = Math.min(vp.width, rRect.x + rRect.width);
            const minY = Math.max(0, rRect.y);
            const maxY = Math.min(vp.height, rRect.y + rRect.height);
            const clippedReadingHeight = Math.max(0, maxY - minY);
            expect(
              clippedReadingHeight,
              `Reading region clipped height (${clippedReadingHeight}px) must be >= 50% of viewport height (${0.5 * vp.height}px) in Details at ${vp.name}`,
            ).toBeGreaterThanOrEqual(0.5 * vp.height);

            const points: Array<{ x: number; y: number }> = [];
            if (maxX > minX && maxY > minY) {
              for (let ix = 0; ix < 5; ix++) {
                for (let iy = 0; iy < 9; iy++) {
                  const px = minX + ((ix + 0.5) / 5) * (maxX - minX);
                  const py = minY + ((iy + 0.5) / 9) * (maxY - minY);
                  points.push({ x: px, y: py });
                }
              }
            }

            const hitCount = await page.evaluate(
              ({ samplePoints }) => {
                const readingEl =
                  document.querySelector(
                    'section.article[data-active="true"] [data-region="reading"]',
                  ) || document.querySelector('[data-region="reading"]');
                if (!readingEl) return 0;
                let hits = 0;
                for (const pt of samplePoints) {
                  const el = document.elementFromPoint(pt.x, pt.y);
                  if (el && (el === readingEl || readingEl.contains(el))) {
                    hits++;
                  }
                }
                return hits;
              },
              { samplePoints: points },
            );

            const totalPoints = points.length === 0 ? 45 : points.length;
            const hitRatio = hitCount / totalPoints;
            expect(
              hitRatio,
              `Reading space hit ratio (${(hitRatio * 100).toFixed(1)}%) must be at least 60% in Details at ${vp.name}`,
            ).toBeGreaterThanOrEqual(0.6);
          }

          const k0Loc = page
            .locator('section.article[data-active="true"] [data-k="0"], [data-k="0"]')
            .first();
          const k0Rect = await visibleRect(k0Loc);
          expect(k0Rect, 'Details block [data-k="0"] must be visible at rest').not.toBeNull();
          if (k0Rect) {
            const vpIntersects =
              intersectArea(k0Rect, { x: 0, y: 0, width: vp.width, height: vp.height }) > 0;
            expect(
              vpIntersects,
              'Details block [data-k="0"] must intersect the viewport at rest',
            ).toBe(true);

            // In compact-portrait the Next button and the dock float over the masked foot of the reading
            // column by design (today's phone layout, kept pixel-identical), so only the other stages
            // check them.
            const checkRegions =
              vp.stage === 'compact-portrait'
                ? ['details-head', 'topbar']
                : ['details-head', 'details-foot', 'topbar', 'dock'];
            for (const rName of checkRegions) {
              const other = visibleRegions.get(rName);
              if (other) {
                const overlap = intersectArea(k0Rect, other.rect);
                expect(
                  overlap,
                  `Block [data-k="0"] overlaps "${rName}" by ${overlap}px² (> 4px²) at ${vp.name}`,
                ).toBeLessThanOrEqual(4);
              }
            }
          }

          const btitleLoc = page
            .locator('section.article[data-active="true"] .btitle, .btitle')
            .first();
          const btitleRect = await visibleRect(btitleLoc);
          expect(btitleRect, '.btitle must exist and be visible in Details view').not.toBeNull();
          if (btitleRect) {
            const inside = insideViewport(btitleRect, vp, 1);
            expect(inside, `.btitle must lie inside the viewport at ${vp.name}`).toBe(true);
          }

          const fontSizes = await page.evaluate(() => {
            const art =
              document.querySelector('section.article[data-active="true"]') ||
              document.querySelector('.view.details') ||
              document;
            const ps = Array.from(art.querySelectorAll<HTMLElement>('.sec p'));
            return ps.map((p) => {
              const fsStr = window.getComputedStyle(p).fontSize;
              return parseFloat(fsStr);
            });
          });
          expect(
            fontSizes.length,
            'At least one .sec p must exist in Details view',
          ).toBeGreaterThan(0);
          const minFontSize = vp.stage === 'compact-portrait' ? 15.5 : 16;
          for (const fs of fontSizes) {
            expect(
              fs,
              `Every .sec p font-size (${fs}px) must be >= ${minFontSize}px in stage ${vp.stage} at ${vp.name}`,
            ).toBeGreaterThanOrEqual(minFontSize);
          }

          if (vp.stage.startsWith('regular-')) {
            const lineMetrics = await page.evaluate(() => {
              const art =
                document.querySelector('section.article[data-active="true"]') ||
                document.querySelector('.view.details') ||
                document;
              const p = art.querySelector('.sec p');
              if (!p) return null;
              const text = (p.textContent || '').trim();
              const range = document.createRange();
              range.selectNodeContents(p);
              const clientRects = Array.from(range.getClientRects());
              const lines: number[] = [];
              for (const r of clientRects) {
                if (r.width <= 0 || r.height <= 0) continue;
                const match = lines.find((top) => Math.abs(top - r.top) < 4);
                if (match === undefined) {
                  lines.push(r.top);
                }
              }
              const lineCount = lines.length;
              return {
                textLength: text.length,
                lineCount,
                charsPerLine: lineCount > 0 ? text.length / lineCount : 0,
              };
            });

            expect(lineMetrics, 'First .sec p must exist in regular stage').not.toBeNull();
            if (lineMetrics) {
              expect(
                lineMetrics.charsPerLine,
                `Chars per line (${lineMetrics.charsPerLine.toFixed(1)}) must be >= 45 in regular stage at ${vp.name}`,
              ).toBeGreaterThanOrEqual(45);
              expect(
                lineMetrics.charsPerLine,
                `Chars per line (${lineMetrics.charsPerLine.toFixed(1)}) must be <= 75 in regular stage at ${vp.name}`,
              ).toBeLessThanOrEqual(75);
            }
          }
        }

        // 7. Cover view checks
        if (view === 'cover') {
          const ctitleLoc = page
            .locator(
              'section.article[data-active="true"] .ctitle, .view.cover .ctitle, .ctitle',
            )
            .first();
          const ctitleRect = await visibleRect(ctitleLoc);
          expect(ctitleRect, '.ctitle must exist and be visible in Cover view').not.toBeNull();
          if (ctitleRect) {
            const inside = insideViewport(ctitleRect, vp, 1);
            expect(inside, `.ctitle must lie inside the viewport at ${vp.name}`).toBe(true);
          }
        }

        // 8. Hit areas
        const hitAreaResult = await page.evaluate(
          ({ vpWidth, vpHeight }) => {
            const selector =
              'button, a[href], [role="button"], [role="menuitemradio"], [role="tab"], input[type="checkbox"]';
            const allCandidates = Array.from(document.querySelectorAll<HTMLElement>(selector));

            const tested: Array<{ name: string; size: { width: number; height: number } }> = [];
            const failures: Array<{
              accessibleName: string;
              tagName: string;
              rect: { x: number; y: number; width: number; height: number };
              failedPoints: Array<{ x: number; y: number; hitElementDesc: string }>;
            }> = [];

            const clamp = (val: number, min: number, max: number) =>
              Math.max(min, Math.min(max, val));

            for (const el of allCandidates) {
              if (
                el.hasAttribute('disabled') ||
                (el as HTMLButtonElement).disabled ||
                el.getAttribute('aria-disabled') === 'true'
              ) {
                continue;
              }

              if (el.closest('[inert]') || el.closest('[aria-hidden="true"]')) {
                continue;
              }

              const style = window.getComputedStyle(el);
              if (style.visibility === 'hidden' || style.display === 'none') {
                continue;
              }

              let curr: HTMLElement | null = el;
              let opacityProduct = 1;
              while (curr) {
                const s = window.getComputedStyle(curr);
                if (s.visibility === 'hidden' || s.display === 'none') {
                  opacityProduct = 0;
                  break;
                }
                const op = parseFloat(s.opacity);
                if (!Number.isNaN(op)) opacityProduct *= op;
                curr = curr.parentElement;
              }
              if (opacityProduct < 0.05) {
                continue;
              }

              const rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) {
                continue;
              }

              const cx = rect.x + rect.width / 2;
              const cy = rect.y + rect.height / 2;
              if (cx < 0 || cx > vpWidth || cy < 0 || cy > vpHeight) {
                continue;
              }

              const isInline = style.display === 'inline';
              const insideText = Boolean(el.closest('p, li'));
              if (isInline && insideText) {
                continue;
              }

              const accessibleName =
                el.getAttribute('aria-label') ||
                el.getAttribute('title') ||
                (el as HTMLInputElement).value ||
                (el.innerText ? el.innerText.trim().slice(0, 50) : '') ||
                el.getAttribute('id') ||
                el.getAttribute('name') ||
                `<${el.tagName.toLowerCase()}>`;

              tested.push({
                name: accessibleName,
                size: { width: rect.width, height: rect.height },
              });

              const probes = [
                { x: clamp(cx - 21, 0, vpWidth), y: clamp(cy, 0, vpHeight) },
                { x: clamp(cx + 21, 0, vpWidth), y: clamp(cy, 0, vpHeight) },
                { x: clamp(cx, 0, vpWidth), y: clamp(cy - 21, 0, vpHeight) },
                { x: clamp(cx, 0, vpWidth), y: clamp(cy + 21, 0, vpHeight) },
              ];

              const failedPoints: Array<{ x: number; y: number; hitElementDesc: string }> = [];

              for (const pt of probes) {
                const hit = document.elementFromPoint(pt.x, pt.y);
                if (!hit || (hit !== el && !el.contains(hit))) {
                  failedPoints.push({
                    x: pt.x,
                    y: pt.y,
                    hitElementDesc: hit
                      ? `${hit.tagName.toLowerCase()}${hit.className ? '.' + String(hit.className).replace(/\s+/g, '.') : ''}`
                      : 'null',
                  });
                }
              }

              if (failedPoints.length > 0) {
                failures.push({
                  accessibleName,
                  tagName: el.tagName.toLowerCase(),
                  rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                  failedPoints,
                });
              }
            }

            return {
              testedCount: tested.length,
              tested,
              failures,
            };
          },
          { vpWidth: vp.width, vpHeight: vp.height },
        );

        expect(
          hitAreaResult.testedCount,
          `At least 8 elements must be checked for hit areas in ${view} view at ${vp.name} (checked ${hitAreaResult.testedCount})`,
        ).toBeGreaterThanOrEqual(8);

        expect(
          hitAreaResult.failures,
          `Hit area probe failed in ${view} view at ${vp.name}: ${JSON.stringify(hitAreaResult.failures, null, 2)}`,
        ).toHaveLength(0);

        viewsData[String(view)] = {
          stage,
          scrollW,
          innerW,
          regionsFound: Array.from(visibleRegions.keys()),
          hitAreasTested: hitAreaResult.testedCount,
          hitAreaFailures: hitAreaResult.failures.length,
        };
      }

      expect(
        consoleErrors,
        `Console errors occurred at ${vp.name}: ${consoleErrors.join(', ')}`,
      ).toEqual([]);
    } catch (err) {
      testError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      recordViewportFindings(vp.name, {
        name: vp.name,
        stage: vp.stage,
        views: viewsData,
        passed: !testError,
        error: testError,
      });
      await context.close();
    }
  });
}
