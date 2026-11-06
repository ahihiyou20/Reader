import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, newQaContext, nextFrames, openFeed } from '../qa/app';
import {
  analyze,
  line,
  startRecording,
  startScreencast,
  stopRecording,
  throttleCpu,
  touchPath,
  type AnalyzeOptions,
  type Violation,
} from '../qa/continuity';

// ACCEPTANCE D12–D17 (round 2): every frame of a gesture or rotation, at normal speed and on a
// 4× slower CPU. Each scenario writes test-results/qa/continuity/<name>.json for metric.mjs.
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const OUT_DIR = path.resolve(process.cwd(), 'test-results/qa/continuity');
const X = PHONE.width / 2;

interface Ctx {
  page: Page;
  slugs: string[];
  /** Lets the held-back /data/feed.json through (feed-arrives-mid-drag). */
  releaseFeed: () => void;
}
type Run = (c: Ctx) => Promise<AnalyzeOptions>;
/** Set-up done before recording starts. */
const prepare: Record<string, (page: Page) => Promise<void>> = {
  async 'rotate-while-reading'(page) {
    await page.keyboard.press('ArrowRight');
    await settle(page, 400);
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>('section.article[data-active="true"] .dscroll');
      if (s) s.scrollTop = (s.scrollHeight - s.clientHeight) / 2;
    });
    await settle(page, 300);
  },
};

async function slugsInOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('section.article')).map((a) => a.dataset.slug ?? ''));
}

const settle = (page: Page, ms = 1200) => page.waitForTimeout(ms);

const scenarios: Record<string, Run> = {
  async flick({ page, slugs }) {
    const touch = await touchPath(page, line({ x: X, y: 600 }, { x: X, y: 330 }, 6), 8);
    await settle(page);
    return { jumps: true, touches: [touch], expectSlug: slugs[1] };
  },
  async 'slow-drag'({ page, slugs }) {
    const touch = await touchPath(page, line({ x: X, y: 760 }, { x: X, y: 240 }, 26), 16);
    await settle(page);
    return { jumps: true, touches: [touch], expectSlug: slugs[1] };
  },
  async 'reverse-drag'({ page, slugs }) {
    const path = [...line({ x: X, y: 700 }, { x: X, y: 320 }, 12), ...line({ x: X, y: 320 }, { x: X, y: 620 }, 10).slice(1)];
    const touch = await touchPath(page, path, 16);
    await settle(page);
    return { jumps: true, touches: [touch], expectSlug: slugs[0] };
  },
  async horizontal({ page, slugs }) {
    const left = line({ x: 330, y: 420 }, { x: 60, y: 420 }, 8);
    const right = line({ x: 60, y: 420 }, { x: 330, y: 420 }, 8);
    const touches: Array<[number, number]> = [];
    for (const path of [left, left, right, right]) {
      touches.push(await touchPath(page, path, 12));
      await settle(page, 700);
    }
    await settle(page, 500);
    return { jumps: true, touches, steady: true, expectSlug: slugs[0] };
  },
  async 'rapid-keys'({ page }) {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(30);
    }
    await settle(page, 600);
    return { jumps: false };
  },
  async 'like-during-settle'({ page, slugs }) {
    const like = await page.locator('section.article[data-active="true"] .view.cover .rail button[aria-pressed]').first().boundingBox();
    const flick = await touchPath(page, line({ x: X, y: 600 }, { x: X, y: 330 }, 6), 8);
    const tap = await touchPath(page, [{ x: like!.x + like!.width / 2, y: like!.y + like!.height / 2 }], 0);
    await settle(page, 1500);
    return { jumps: true, touches: [flick, tap], expectSlug: slugs[1] };
  },
  async 'feed-arrives-mid-drag'({ page, slugs, releaseFeed }) {
    // The full list is held back by a route and let through half way into the drag.
    const drag = touchPath(page, line({ x: X, y: 760 }, { x: X, y: 240 }, 26), 16);
    await page.waitForTimeout(16 * 13);
    releaseFeed();
    const touch = await drag;
    await settle(page);
    return { jumps: true, touches: [touch], expectSlug: slugs[1] };
  },
  async 'rotate-ios'({ page }) {
    const resizeAt: number[] = [];
    const resize = async (width: number, height: number) => {
      resizeAt.push(await page.evaluate(() => performance.now()));
      await page.setViewportSize({ width, height });
    };
    // Safari turns the phone first, then the toolbar collapses a moment later; and back.
    await resize(844, 390);
    await page.waitForTimeout(16);
    await resize(844, 360);
    await settle(page, 700);
    await resize(390, 844);
    await page.waitForTimeout(120);
    await resize(390, 800);
    await settle(page);
    return { jumps: true, steady: true, resizeAt };
  },
  async 'rotate-reversed'({ page }) {
    const resizeAt: number[] = [];
    resizeAt.push(await page.evaluate(() => performance.now()));
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(150);
    resizeAt.push(await page.evaluate(() => performance.now()));
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    return { jumps: true, steady: true, resizeAt };
  },
  async 'rotate-while-reading'({ page }) {
    const resizeAt = [await page.evaluate(() => performance.now())];
    await page.setViewportSize({ width: 844, height: 390 });
    await settle(page, 900);
    resizeAt.push(await page.evaluate(() => performance.now()));
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    return { jumps: true, steady: true, resizeAt };
  },
};

test.describe('Round 2 D12–D17: frame continuity', () => {
  for (const cpu of [1, 4]) {
    for (const [name, run] of Object.entries(scenarios)) {
      test(`${name} @ cpu ${cpu}x`, async ({ browser }) => {
        const context = await newQaContext(browser, PHONE);
        const page = await context.newPage();
        const errors = collectConsoleErrors(page);

        let releaseFeed: () => void = () => {};
        const held = new Promise<void>((r) => (releaseFeed = r));
        if (name === 'feed-arrives-mid-drag') {
          await page.route('**/data/feed.json', async (route) => {
            await held;
            await route.continue();
          });
        }
        const fullFeed = name === 'feed-arrives-mid-drag' ? null : page.waitForResponse('**/data/feed.json');
        await openFeed(page);
        await fullFeed; // the head-to-full swap is its own scenario
        await nextFrames(page, 3);
        const slugs = await slugsInOrder(page);
        await prepare[name]?.(page);
        await throttleCpu(page, cpu);

        const cast = await startScreencast(page);
        await startRecording(page);
        let opts: AnalyzeOptions;
        try {
          opts = await run({ page, slugs, releaseFeed });
        } finally {
          releaseFeed();
        }
        const rec = await stopRecording(page);
        const violations: Violation[] = [...analyze(rec, opts), ...(await cast.stop())];

        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(OUT_DIR, `${name}-cpu${cpu}${test.info().repeatEachIndex ? `-r${test.info().repeatEachIndex}` : ''}.json`),
          JSON.stringify({ scenario: name, cpu, violations, frames: rec.frames }),
        );
        expect(rec.frames.length).toBeGreaterThan(10);
        expect(violations, violations.map((v) => `${v.kind}: ${v.detail}`).join('\n')).toEqual([]);
        expect(errors).toEqual([]);
        await context.close();
      });
    }
  }
});
