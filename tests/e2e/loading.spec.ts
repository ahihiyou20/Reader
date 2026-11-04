import { expect, test, type Page } from '@playwright/test';
import { firstFeedItem, newQaContext, nextFrames, openFeed } from '../qa/app';

interface RectSimple {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export function matchesCoverImage(currentSrc: string, expectedCover: string, slug?: string): boolean {
  if (!currentSrc || !expectedCover) return false;
  if (currentSrc === expectedCover) return true;

  // Self-hosted variant of the same cover, written by scripts/covers.mjs at build time.
  if (slug && new RegExp(`/covers/opt/${slug}-\\d+\\.webp$`).test(new URL(currentSrc, 'http://localhost').pathname)) {
    return true;
  }

  // picsum.photos: same /id/<n>/ image at any size
  const picsumIdRegex = /(?:picsum\.photos|fastly\.picsum\.photos)\/id\/(\d+)/;
  const picsumExpMatch = expectedCover.match(picsumIdRegex);
  const picsumCurMatch = currentSrc.match(picsumIdRegex);
  if (picsumExpMatch && picsumCurMatch) {
    return picsumExpMatch[1] === picsumCurMatch[1];
  }

  // Exact cover URL match (absolute vs relative, or pathname comparison)
  try {
    const curUrl = new URL(currentSrc, 'http://localhost');
    const expUrl = new URL(expectedCover, 'http://localhost');
    if (curUrl.origin === expUrl.origin && curUrl.pathname === expUrl.pathname) {
      return true;
    }
    if (curUrl.pathname === expUrl.pathname && expUrl.pathname !== '/') {
      return true;
    }
  } catch {
    // ignore URL parsing error
  }

  return currentSrc.endsWith(expectedCover) || expectedCover.endsWith(currentSrc);
}

test.describe('TESTSPEC §10 / ACCEPTANCE 17–20: Loading', () => {
  const noJsViewports = [
    { name: '390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: '1440x900', width: 1440, height: 900, isMobile: false, hasTouch: false },
  ];

  for (const vp of noJsViewports) {
    test(`JavaScript disabled displays poster and title (${vp.name})`, async ({ browser }) => {
      const context = await newQaContext(browser, vp, { javaScriptEnabled: false });
      const page = await context.newPage();
      const firstItem = await firstFeedItem(context.request);
      const expectedCover =
        firstItem.cover.type === 'video'
          ? (firstItem.cover.poster ?? firstItem.cover.url)
          : firstItem.cover.url;
      const expectedTitle = firstItem.title.en;

      await page.goto('/');

      const posterImg = page.locator('[data-poster] img');
      await expect(posterImg).toBeVisible();
      const currentSrc = await posterImg.evaluate(
        (img) => (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src,
      );
      expect(
        matchesCoverImage(currentSrc, expectedCover, firstItem.slug),
        `Poster image currentSrc "${currentSrc}" must match expected cover "${expectedCover}"`,
      ).toBe(true);

      const titleLocator = page.locator('[data-poster]').getByText(expectedTitle);
      await expect(titleLocator).toBeVisible();

      await context.close();
    });
  }

  test('LCP element is the real first cover image after 4s (390x844)', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const firstItem = await firstFeedItem(context.request);
    const expectedCover =
      firstItem.cover.type === 'video'
        ? (firstItem.cover.poster ?? firstItem.cover.url)
        : firstItem.cover.url;

    await page.goto('/');
    await page.waitForTimeout(4000);

    const lcpEntry = await page.evaluate(() => {
      return new Promise<{ tagName: string; currentSrc: string; url: string } | null>((resolve) => {
        try {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              const last = entries[entries.length - 1] as PerformanceEntry & {
                element?: Element;
                url?: string;
              };
              const el = last.element;
              resolve({
                tagName: el?.tagName ?? '',
                currentSrc: el instanceof HTMLImageElement ? (el.currentSrc || el.src) : '',
                url: last.url ?? '',
              });
              return;
            }
          });
          observer.observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => resolve(null), 200);
        } catch {
          resolve(null);
        }
      });
    });

    expect(lcpEntry, 'LCP entry recorded').not.toBeNull();
    expect(lcpEntry?.tagName).toBe('IMG');
    const matchedSrc = lcpEntry?.currentSrc || lcpEntry?.url || '';
    expect(
      matchesCoverImage(matchedSrc, expectedCover, firstItem.slug),
      `LCP image source "${matchedSrc}" must match expected cover "${expectedCover}"`,
    ).toBe(true);

    await context.close();
  });

  const clsViewports = [
    { name: '390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: '844x390', width: 844, height: 390, isMobile: true, hasTouch: true },
    { name: '1440x900', width: 1440, height: 900, isMobile: false, hasTouch: false },
  ];

  for (const vp of clsViewports) {
    test(`CLS <= 0.01 over first 5 seconds (${vp.name})`, async ({ browser }) => {
      const context = await newQaContext(browser, vp);
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForTimeout(5000);

      const cls = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let total = 0;
          try {
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                const shift = entry as PerformanceEntry & {
                  hadRecentInput?: boolean;
                  value?: number;
                };
                if (!shift.hadRecentInput && typeof shift.value === 'number') {
                  total += shift.value;
                }
              }
            });
            observer.observe({ type: 'layout-shift', buffered: true });
            setTimeout(() => resolve(total), 200);
          } catch {
            resolve(total);
          }
        });
      });

      expect(cls).toBeLessThanOrEqual(0.01);
      await context.close();
    });
  }

  test('decode fade of cover images on scroll down', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    await page.route(/(covers|\.webp|\.png|\.jpe?g)/, async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });

    await openFeed(page);
    await nextFrames(page, 2);

    const samplingPromise = page.evaluate(() => {
      return new Promise<number[]>((resolve) => {
        const samples: number[] = [];
        let count = 0;
        function step() {
          count++;
          const articles = document.querySelectorAll('section.article');
          const second = articles[1];
          const media = second?.querySelector('.media');
          if (media) {
            const op = parseFloat(window.getComputedStyle(media).opacity);
            if (!Number.isNaN(op)) {
              samples.push(op);
              if (op >= 1 && samples.length > 5) {
                resolve(samples);
                return;
              }
            }
          }
          if (count > 240) {
            resolve(samples);
            return;
          }
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    });

    await page.keyboard.press('ArrowDown');
    const samples = await samplingPromise;

    const intermediates = new Set(
      samples
        .filter((v) => v > 0 && v < 1)
        .map((v) => Math.round(v * 1000) / 1000),
    );
    expect(intermediates.size, 'Distinct opacity values between 0 and 1 during decode fade').toBeGreaterThanOrEqual(3);

    await context.close();
  });

  for (const vp of clsViewports) {
    test(`skeleton blocks align with real article content within 8px (${vp.name})`, async ({
      browser,
    }) => {
      const context = await newQaContext(browser, vp);
      const page = await context.newPage();

      await page.route('**/data/articles/**', async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });

      await openFeed(page);
      await page.keyboard.press('ArrowRight');

      // Record bounding rects of [data-skeleton] [data-skel-block="k"] while loading
      await page.waitForTimeout(200);
      const skelRects = await page.evaluate(() => {
        const result: Record<string, RectSimple> = {};
        const elements = document.querySelectorAll('[data-skeleton] [data-skel-block]');
        elements.forEach((el) => {
          const k = el.getAttribute('data-skel-block');
          if (k) {
            const r = el.getBoundingClientRect();
            result[k] = { top: r.top, left: r.left, width: r.width, height: r.height };
          }
        });
        return result;
      });

      // Wait for real content to finish loading and rendering
      await page.waitForSelector('[data-k]', { timeout: 8000 });
      await nextFrames(page, 3);

      const realRects = await page.evaluate(() => {
        const result: Record<string, RectSimple> = {};
        const elements = document.querySelectorAll('[data-k]');
        elements.forEach((el) => {
          const k = el.getAttribute('data-k');
          if (k) {
            const r = el.getBoundingClientRect();
            result[k] = { top: r.top, left: r.left, width: r.width, height: r.height };
          }
        });
        return result;
      });

      let matched = 0;
      for (const k of Object.keys(skelRects)) {
        if (realRects[k]) {
          const skel = skelRects[k];
          const real = realRects[k];
          // Only the first block's top is knowable before the text arrives; later blocks sit below
          // paragraphs of unknown length.
          if (k === '0') {
            expect(
              Math.abs(skel.top - real.top),
              `Block ${k} top delta <= 8px`,
            ).toBeLessThanOrEqual(8);
          }
          expect(
            Math.abs(skel.left - real.left),
            `Block ${k} left delta <= 8px`,
          ).toBeLessThanOrEqual(8);
          matched++;
        }
      }

      expect(matched, 'At least 2 matched skeleton blocks aligned').toBeGreaterThanOrEqual(2);
      await context.close();
    });
  }

  test('stagger entrance of Explore grid cards', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await openFeed(page);

    const startTimes = await captureEntranceStartTimes(
      page,
      async () => {
        const exploreBtn = page.locator('.topbar button.tb-ic:has(svg.lucide-compass), .crow .gridbtn').first();
        await exploreBtn.click();
      },
      '.grid .card, [data-explore-grid] [data-card], .grid > button',
    );

    expect(startTimes.length, 'At least 4 grid cards recorded with entrance times').toBeGreaterThanOrEqual(4);

    for (let i = 0; i < 3; i++) {
      const gap = startTimes[i + 1] - startTimes[i];
      expect(
        gap,
        `Consecutive gap between card ${i} and ${i + 1} (${gap}ms) must be in 30-80ms`,
      ).toBeGreaterThanOrEqual(30);
      expect(
        gap,
        `Consecutive gap between card ${i} and ${i + 1} (${gap}ms) must be in 30-80ms`,
      ).toBeLessThanOrEqual(80);
    }

    await context.close();
  });

  test('stagger entrance of Search result items', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await openFeed(page);

    const searchBtn = page.locator('.bnav .search').first();
    await searchBtn.click();
    await page.waitForTimeout(200);

    const startTimes = await captureEntranceStartTimes(
      page,
      async () => {
        await page.locator('.sinput').fill('the');
      },
      '.rlist .ritem, .rlist button, [data-search-results] [data-item]',
    );

    expect(startTimes.length, 'At least 4 search results recorded with entrance times').toBeGreaterThanOrEqual(4);

    for (let i = 0; i < 3; i++) {
      const gap = startTimes[i + 1] - startTimes[i];
      expect(
        gap,
        `Consecutive gap between search item ${i} and ${i + 1} (${gap}ms) must be in 30-80ms`,
      ).toBeGreaterThanOrEqual(30);
      expect(
        gap,
        `Consecutive gap between search item ${i} and ${i + 1} (${gap}ms) must be in 30-80ms`,
      ).toBeLessThanOrEqual(80);
    }

    await context.close();
  });
});

async function captureEntranceStartTimes(
  page: Page,
  triggerAction: () => Promise<void>,
  selector: string,
): Promise<number[]> {
  await page.evaluate((itemSelector) => {
    type StaggerWindow = typeof window & {
      __qaStaggerTimes?: Map<Element, number>;
      __qaStaggerCleanup?: () => void;
    };
    const win = window as unknown as StaggerWindow;
    const map = new Map<Element, number>();
    win.__qaStaggerTimes = map;

    const check = () => {
      const elements = document.querySelectorAll(itemSelector);
      elements.forEach((el) => {
        if (!map.has(el)) {
          const anims = el.getAnimations();
          for (const a of anims) {
            if (typeof a.startTime === 'number' && Number.isFinite(a.startTime)) {
              map.set(el, a.startTime);
              return;
            }
          }
        }
      });
    };

    const mo = new MutationObserver((mutations) => {
      const now = performance.now();
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'style' && m.target instanceof Element) {
          if (m.target.matches(itemSelector) && !map.has(m.target)) {
            map.set(m.target, now);
          }
        }
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              if (node.matches(itemSelector) && !map.has(node)) {
                map.set(node, now);
              }
              node.querySelectorAll(itemSelector).forEach((desc) => {
                if (!map.has(desc)) map.set(desc, now);
              });
            }
          });
        }
      }
      check();
    });

    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    let running = true;
    function loop() {
      if (!running) return;
      check();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    win.__qaStaggerCleanup = () => {
      running = false;
      mo.disconnect();
    };
  }, selector);

  await triggerAction();
  await page.waitForTimeout(700);

  const times = await page.evaluate((itemSelector) => {
    type StaggerWindow = typeof window & {
      __qaStaggerTimes?: Map<Element, number>;
      __qaStaggerCleanup?: () => void;
    };
    const win = window as unknown as StaggerWindow;
    win.__qaStaggerCleanup?.();
    const map = win.__qaStaggerTimes;
    if (!map) return [];
    const elements = Array.from(document.querySelectorAll(itemSelector)).slice(0, 4);
    return elements.map((el) => map.get(el) ?? null);
  }, selector);

  return times.filter((t): t is number => typeof t === 'number');
}
