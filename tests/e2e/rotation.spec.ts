import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, goToView, newQaContext, nextFrames, openFeed } from '../qa/app';
import { recordFrames } from '../qa/frames';
import { stageOf } from '@/lib/stage';

export interface SamplerData {
  innerWidth: number;
  innerHeight: number;
  slug: string | null;
  coverage: number;
  otherVisibleCount: number;
  stage: string | null;
}

export interface ReadingAnchorInfo {
  dataK: string | null;
  offset: number;
  blockHeight: number;
  scrollProgress: number;
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export interface ScenarioFileResult {
  scenario: number;
  wrongFrames: number;
  samples: number;
  nullSamples: number;
}

function writeScenarioResult(result: ScenarioFileResult): void {
  const dir = path.resolve(process.cwd(), 'test-results/qa/rotation');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, `scenario-${result.scenario}.json`);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
}

function countNullSamples(samples: Array<{ data: unknown }>): number {
  return samples.filter((s) => s.data === null).length;
}

const SAMPLER_SOURCE = `function() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const vpArea = w * h;

  if (typeof document.getAnimations === 'function') {
    if (!window.__qaVTRecords) window.__qaVTRecords = [];
    try {
      const anims = document.getAnimations();
      for (let i = 0; i < anims.length; i++) {
        const anim = anims[i];
        const effect = anim.effect;
        const pseudo = (effect && effect.pseudoElement) || '';
        if (pseudo.startsWith('::view-transition')) {
          const timing = effect && typeof effect.getTiming === 'function' ? effect.getTiming() : {};
          const duration = typeof timing.duration === 'number' ? timing.duration : parseFloat(timing.duration || '0');
          window.__qaVTRecords.push({ pseudo: pseudo, duration: duration });
        }
        const target = effect && effect.target;
        const isApp = target instanceof Element && (target.classList?.contains('app') || target.tagName === 'HTML' || target.tagName === 'BODY');
        const isRoot = pseudo.includes('(root)') || pseudo === '::view-transition-old(root)' || pseudo === '::view-transition-new(root)';
        if (isApp || isRoot) {
          if (!window.__qaReducedMotionAnims) window.__qaReducedMotionAnims = [];
          const timing = effect && typeof effect.getTiming === 'function' ? effect.getTiming() : {};
          const duration = typeof timing.duration === 'number' ? timing.duration : parseFloat(timing.duration || '0');
          window.__qaReducedMotionAnims.push({ pseudo: pseudo, isApp: Boolean(isApp), duration: duration });
        }
      }
    } catch {}
  }

  let active = document.querySelector('section.article[data-active="true"]');
  if (!active) {
    active = document.querySelector('section.article:not([inert])');
  }
  const allArticles = Array.from(document.querySelectorAll('section.article'));
  if (!active && allArticles.length > 0) {
    let best = null;
    let maxArea = -1;
    for (let i = 0; i < allArticles.length; i++) {
      const a = allArticles[i];
      const r = a.getBoundingClientRect();
      const ix = Math.max(0, Math.min(w, r.right) - Math.max(0, r.left));
      const iy = Math.max(0, Math.min(h, r.bottom) - Math.max(0, r.top));
      const area = ix * iy;
      if (area > maxArea) {
        maxArea = area;
        best = a;
      }
    }
    active = best;
  }

  let slug = null;
  let coverage = 0;
  if (active) {
    slug = active.getAttribute('data-slug') ||
      active.getAttribute('aria-labelledby')?.replace(/^t-/, '') ||
      null;
    const r = active.getBoundingClientRect();
    const ix = Math.max(0, Math.min(w, r.right) - Math.max(0, r.left));
    const iy = Math.max(0, Math.min(h, r.bottom) - Math.max(0, r.top));
    const area = ix * iy;
    coverage = vpArea > 0 ? area / vpArea : 0;
  }

  let otherVisibleCount = 0;
  for (let i = 0; i < allArticles.length; i++) {
    const a = allArticles[i];
    if (a === active) continue;
    const r = a.getBoundingClientRect();
    const ix = Math.max(0, Math.min(w, r.right) - Math.max(0, r.left));
    const iy = Math.max(0, Math.min(h, r.bottom) - Math.max(0, r.top));
    const area = ix * iy;
    if (vpArea > 0 && area > 0.01 * vpArea) {
      otherVisibleCount++;
    }
  }

  return {
    innerWidth: w,
    innerHeight: h,
    slug: slug,
    coverage: coverage,
    otherVisibleCount: otherVisibleCount,
    stage: document.documentElement.getAttribute('data-stage')
  };
}`;

// The stage changes inside the View Transition, so the first frame at a new size can still carry
// the previous stage's layout (it becomes the transition's "old" snapshot). Up to two such frames per
// resize are accepted, and only while no other article is visible; every other frame must have the
// active article covering the viewport.
const MAX_STAGE_PENDING_FRAMES = 2;

function countWrongFrames(
  samples: Array<{ data: SamplerData | null }>,
  targetWidth: number,
  targetHeight: number,
  options?: { isScenario5?: boolean; targetSlug?: string },
): number {
  const targetSamples = samples.filter(
    (s): s is { data: SamplerData } =>
      s.data !== null && s.data.innerWidth === targetWidth && s.data.innerHeight === targetHeight,
  );

  expect(targetSamples.length).toBeGreaterThanOrEqual(20);

  const nullCount = samples.filter((s) => s.data === null).length;
  const expectedStage = stageOf(targetWidth, targetHeight);
  let excused = 0;
  const isWrong = (d: SamplerData): boolean => {
    const wrong = d.coverage < 0.99 || d.otherVisibleCount > 0;
    if (wrong && d.stage !== expectedStage && d.otherVisibleCount === 0 && excused < MAX_STAGE_PENDING_FRAMES) {
      excused++;
      return false;
    }
    return wrong;
  };

  if (options?.isScenario5) {
    const settledIndex = targetSamples.findIndex(
      (s) =>
        s.data.coverage >= 0.99 &&
        s.data.otherVisibleCount === 0 &&
        (!options.targetSlug || s.data.slug === options.targetSlug),
    );
    if (settledIndex === -1) {
      return Math.max(1, targetSamples.length) + nullCount;
    }
    return targetSamples.slice(settledIndex).filter((s) => isWrong(s.data)).length + nullCount;
  }

  return targetSamples.filter((s) => isWrong(s.data)).length + nullCount;
}

async function getActiveSlug(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const active =
      document.querySelector('section.article[data-active="true"]') ||
      document.querySelector('section.article:not([inert])');
    if (!active) return null;
    return (
      active.getAttribute('data-slug') ||
      active.getAttribute('aria-labelledby')?.replace(/^t-/, '') ||
      null
    );
  });
}

async function getActiveViewIndex(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const art =
      document.querySelector('section.article[data-active="true"]') ||
      document.querySelector('section.article:not([inert])');
    if (art) {
      const activeView = art.querySelector('[data-view]');
      if (activeView) {
        const val = activeView.getAttribute('data-view');
        if (val === 'cover') return 0;
        if (val === 'details') return 1;
        if (val === 'engage') return 2;
      }
      const views = art.querySelectorAll('.view');
      for (let i = 0; i < views.length; i++) {
        if (views[i].getAttribute('aria-hidden') === 'false') return i;
      }
    }
    return 0;
  });
}

async function getReadingAnchor(page: Page): Promise<ReadingAnchorInfo> {
  return await page.evaluate(() => {
    const art =
      document.querySelector('section.article[data-active="true"]') ||
      document.querySelector('section.article:not([inert])');
    const scroller = (art ? art.querySelector('.dscroll') : document.querySelector('.dscroll')) as HTMLElement | null;
    if (!scroller) throw new Error('Details scroll container (.dscroll) not found');

    const scrollTop = scroller.scrollTop;
    const clientHeight = scroller.clientHeight;
    const scrollHeight = scroller.scrollHeight;
    const maxScroll = scrollHeight - clientHeight;
    const scrollProgress = maxScroll > 0 ? scrollTop / maxScroll : 0;
    const lineY = scrollTop + 0.42 * clientHeight;

    const blocks = Array.from(scroller.querySelectorAll<HTMLElement>('[data-k]'));
    let matchedBlock: HTMLElement | null = null;
    let matchedK: string | null = null;
    let blockTop = 0;
    let blockHeight = 0;

    for (const b of blocks) {
      const top = b.offsetTop;
      const h = b.offsetHeight;
      if (top <= lineY && lineY <= top + h) {
        matchedBlock = b;
        matchedK = b.getAttribute('data-k');
        blockTop = top;
        blockHeight = h;
        break;
      }
    }

    if (!matchedBlock && blocks.length > 0) {
      if (lineY < blocks[0].offsetTop) {
        matchedBlock = blocks[0];
        matchedK = blocks[0].getAttribute('data-k');
        blockTop = blocks[0].offsetTop;
        blockHeight = blocks[0].offsetHeight;
      } else {
        const last = blocks[blocks.length - 1];
        matchedBlock = last;
        matchedK = last.getAttribute('data-k');
        blockTop = last.offsetTop;
        blockHeight = last.offsetHeight;
      }
    }

    const offset = matchedBlock ? lineY - blockTop : 0;
    return {
      dataK: matchedK,
      offset,
      blockHeight,
      scrollProgress,
      scrollTop,
      clientHeight,
      scrollHeight,
    };
  });
}

function checkViewTransitions(vtRecords: Array<{ pseudo: string; duration: number }>): void {
  const groupNames = new Set<string>();
  const durations: number[] = [];

  for (const rec of vtRecords) {
    const match = rec.pseudo.match(/^::view-transition-group\((.+)\)$/);
    if (match) {
      const name = match[1];
      if (name !== 'root') {
        groupNames.add(name);
        durations.push(rec.duration);
      }
    }
  }

  expect(groupNames.size).toBeGreaterThanOrEqual(4);
  for (const d of durations) {
    expect(d).toBeGreaterThanOrEqual(300);
    expect(d).toBeLessThanOrEqual(600);
  }
}


test.describe('rotation tests', () => {
  test('scenario 1: cover of 3rd article rotates 844x390 and back', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const errors = collectConsoleErrors(page);

      await openFeed(page);
      await page.keyboard.press('ArrowDown');
      await nextFrames(page, 2);
      await page.keyboard.press('ArrowDown');
      await nextFrames(page, 2);
      await page.waitForTimeout(300);

      const initialSlug = await getActiveSlug(page);
      const initialView = await getActiveViewIndex(page);

      await page.evaluate(() => {
        type QAWindow = Window & { __qaVTRecords?: Array<{ pseudo: string; duration: number }> };
        (window as unknown as QAWindow).__qaVTRecords = [];
      });

      const rec1 = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 844, height: 390 });
      const samples1 = await rec1;
      const wrong1 = countWrongFrames(samples1, 844, 390);

      const vtRecords = await page.evaluate(() => {
        type QAWindow = Window & { __qaVTRecords?: Array<{ pseudo: string; duration: number }> };
        return (window as unknown as QAWindow).__qaVTRecords || [];
      });
      checkViewTransitions(vtRecords);

      await page.evaluate(() => {
        type QAWindow = Window & { __qaVTRecords?: Array<{ pseudo: string; duration: number }> };
        (window as unknown as QAWindow).__qaVTRecords = [];
      });

      const rec2 = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 390, height: 844 });
      const samples2 = await rec2;
      const wrong2 = countWrongFrames(samples2, 390, 844);

      const finalSlug = await getActiveSlug(page);
      const finalView = await getActiveViewIndex(page);
      const totalWrong = wrong1 + wrong2;

      writeScenarioResult({
        scenario: 1,
        wrongFrames: totalWrong,
        samples: samples1.length + samples2.length,
        nullSamples: countNullSamples(samples1) + countNullSamples(samples2),
      });

      expect(finalSlug).toBe(initialSlug);
      expect(finalView).toBe(initialView);
      expect(totalWrong).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('scenario 2: details of 2nd article scrolled 50% reading anchor preservation', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const errors = collectConsoleErrors(page);

      await openFeed(page);
      await page.keyboard.press('ArrowDown');
      await nextFrames(page, 2);
      await page.waitForTimeout(300);

      await page.keyboard.press('ArrowRight');
      await page.waitForSelector('.dscroll', { timeout: 10_000 });
      await nextFrames(page, 2);

      await page.evaluate(() => {
        const art =
          document.querySelector('section.article[data-active="true"]') ||
          document.querySelector('section.article:not([inert])');
        const scroller = (art ? art.querySelector('.dscroll') : document.querySelector('.dscroll')) as HTMLElement | null;
        if (!scroller) throw new Error('Details scroll container (.dscroll) not found');
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = Math.round(maxScroll * 0.5);
      });
      await nextFrames(page, 2);

      const beforeAnchor = await getReadingAnchor(page);
      const initialSlug = await getActiveSlug(page);
      const initialView = await getActiveViewIndex(page);

      const rec = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 844, height: 390 });
      const samples = await rec;
      const wrong = countWrongFrames(samples, 844, 390);

      const afterAnchor = await getReadingAnchor(page);
      const finalSlug = await getActiveSlug(page);
      const finalView = await getActiveViewIndex(page);

      writeScenarioResult({
        scenario: 2,
        wrongFrames: wrong,
        samples: samples.length,
        nullSamples: countNullSamples(samples),
      });

      expect(finalSlug).toBe(initialSlug);
      expect(finalView).toBe(initialView);
      expect(afterAnchor.dataK).toBe(beforeAnchor.dataK);

      const scaledBeforeOffset =
        beforeAnchor.blockHeight > 0
          ? beforeAnchor.offset * (afterAnchor.blockHeight / beforeAnchor.blockHeight)
          : beforeAnchor.offset;
      const offsetDiff = Math.abs(afterAnchor.offset - scaledBeforeOffset);
      expect(offsetDiff).toBeLessThanOrEqual(32);

      const progressDiff = Math.abs(afterAnchor.scrollProgress - beforeAnchor.scrollProgress);
      expect(progressDiff).toBeLessThanOrEqual(0.03);

      expect(wrong).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('scenario 3: engage of 1st article rotates 844x390, 1180x820, and back', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const errors = collectConsoleErrors(page);

      await openFeed(page);
      await goToView(page, 'engage');
      await page.waitForTimeout(300);

      const initialSlug = await getActiveSlug(page);
      const initialView = await getActiveViewIndex(page);

      await page.evaluate(() => {
        type QAWindow = Window & { __qaVTRecords?: Array<{ pseudo: string; duration: number }> };
        (window as unknown as QAWindow).__qaVTRecords = [];
      });

      const rec1 = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 844, height: 390 });
      const samples1 = await rec1;
      const wrong1 = countWrongFrames(samples1, 844, 390);

      await page.evaluate(() => {
        type QAWindow = Window & { __qaVTRecords?: Array<{ pseudo: string; duration: number }> };
        (window as unknown as QAWindow).__qaVTRecords = [];
      });

      const rec2 = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 1180, height: 820 });
      const samples2 = await rec2;
      const wrong2 = countWrongFrames(samples2, 1180, 820);

      const vtRecords = await page.evaluate(() => {
        type QAWindow = Window & { __qaVTRecords?: Array<{ pseudo: string; duration: number }> };
        return (window as unknown as QAWindow).__qaVTRecords || [];
      });
      checkViewTransitions(vtRecords);

      await page.evaluate(() => {
        type QAWindow = Window & { __qaVTRecords?: Array<{ pseudo: string; duration: number }> };
        (window as unknown as QAWindow).__qaVTRecords = [];
      });

      const rec3 = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 390, height: 844 });
      const samples3 = await rec3;
      const wrong3 = countWrongFrames(samples3, 390, 844);

      const finalSlug = await getActiveSlug(page);
      const finalView = await getActiveViewIndex(page);
      const totalWrong = wrong1 + wrong2 + wrong3;

      writeScenarioResult({
        scenario: 3,
        wrongFrames: totalWrong,
        samples: samples1.length + samples2.length + samples3.length,
        nullSamples:
          countNullSamples(samples1) + countNullSamples(samples2) + countNullSamples(samples3),
      });

      expect(finalSlug).toBe(initialSlug);
      expect(finalView).toBe(initialView);
      expect(totalWrong).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('scenario 4: reversal rotates 844x390, 150ms then back to 390x844', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const errors = collectConsoleErrors(page);

      await openFeed(page);
      const initialSlug = await getActiveSlug(page);
      const initialView = await getActiveViewIndex(page);

      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(150);

      const rec = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 390, height: 844 });
      const samples = await rec;
      const wrong = countWrongFrames(samples, 390, 844);

      const finalSlug = await getActiveSlug(page);
      const finalView = await getActiveViewIndex(page);
      const lastSample = samples[samples.length - 1];

      writeScenarioResult({
        scenario: 4,
        wrongFrames: wrong,
        samples: samples.length,
        nullSamples: countNullSamples(samples),
      });

      expect(finalSlug).toBe(initialSlug);
      expect(finalView).toBe(initialView);
      expect(lastSample?.data.coverage).toBeGreaterThanOrEqual(0.99);
      expect(wrong).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('scenario 5: in-flight swipe flick and rotation after 80ms', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const errors = collectConsoleErrors(page);

      await openFeed(page);
      const secondSlug = await page.evaluate(() => {
        const articles = Array.from(document.querySelectorAll('section.article'));
        if (articles.length > 1) {
          return (
            articles[1].getAttribute('data-slug') ||
            articles[1].getAttribute('aria-labelledby')?.replace(/^t-/, '') ||
            null
          );
        }
        return null;
      });

      const cdp = await page.context().newCDPSession(page);
      const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
      const startX = 195;
      const startY = 550;
      const endY = startY - 320;
      const steps = 6;

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(startX, startY),
      });

      for (let i = 1; i <= steps; i++) {
        const curY = startY + ((endY - startY) * i) / steps;
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: point(startX, curY),
        });
        await page.waitForTimeout(16);
      }

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await cdp.detach().catch(() => {});

      await page.waitForTimeout(80);
      const rec = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 844, height: 390 });
      const samples = await rec;

      const wrong = countWrongFrames(samples, 844, 390, {
        isScenario5: true,
        targetSlug: secondSlug ?? undefined,
      });

      const finalSlug = await getActiveSlug(page);
      const finalView = await getActiveViewIndex(page);
      const lastSample = samples[samples.length - 1];

      writeScenarioResult({
        scenario: 5,
        wrongFrames: wrong,
        samples: samples.length,
        nullSamples: countNullSamples(samples),
      });

      expect(secondSlug).toBeTruthy();
      expect(finalSlug).toBe(secondSlug);
      expect(finalView).toBe(0);
      expect(lastSample?.data.coverage).toBeGreaterThanOrEqual(0.99);
      expect(wrong).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('reduced motion: scenario 1 with reduced motion prefers crossfade', async ({ browser }) => {
    const context = await newQaContext(
      browser,
      { width: 390, height: 844, isMobile: true, hasTouch: true },
      { reducedMotion: 'reduce' },
    );
    try {
      const page = await context.newPage();
      const errors = collectConsoleErrors(page);

      await openFeed(page);
      await page.keyboard.press('ArrowDown');
      await nextFrames(page, 2);
      await page.keyboard.press('ArrowDown');
      await nextFrames(page, 2);
      await page.waitForTimeout(300);

      await page.evaluate(() => {
        type QAWindow = Window & {
          __qaVTRecords?: Array<{ pseudo: string; duration: number }>;
          __qaReducedMotionAnims?: Array<{ pseudo: string; isApp: boolean; duration: number }>;
        };
        const win = window as unknown as QAWindow;
        win.__qaVTRecords = [];
        win.__qaReducedMotionAnims = [];
      });

      const rec1 = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 844, height: 390 });
      const samples1 = await rec1;
      const wrong1 = countWrongFrames(samples1, 844, 390);

      const rec2 = recordFrames<SamplerData>(page, SAMPLER_SOURCE, 2500);
      await page.setViewportSize({ width: 390, height: 844 });
      const samples2 = await rec2;
      const wrong2 = countWrongFrames(samples2, 390, 844);

      const vtRecords = await page.evaluate(() => {
        type QAWindow = Window & { __qaVTRecords?: Array<{ pseudo: string; duration: number }> };
        return (window as unknown as QAWindow).__qaVTRecords || [];
      });
      const reducedAnims = await page.evaluate(() => {
        type QAWindow = Window & {
          __qaReducedMotionAnims?: Array<{ pseudo: string; isApp: boolean; duration: number }>;
        };
        return (window as unknown as QAWindow).__qaReducedMotionAnims || [];
      });

      const nonRootGroups: string[] = [];
      for (const rec of vtRecords) {
        const match = rec.pseudo.match(/^::view-transition-group\((.+)\)$/);
        if (match && match[1] !== 'root') {
          nonRootGroups.push(match[1]);
        }
      }
      expect(nonRootGroups).toEqual([]);

      for (const anim of reducedAnims) {
        expect(anim.duration).toBeLessThanOrEqual(200);
      }

      const totalWrong = wrong1 + wrong2;
      expect(totalWrong).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('web manifest orientation test', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as { orientation?: string };
    expect(manifest.orientation).toBe('any');
  });
});
