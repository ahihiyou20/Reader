import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, newQaContext, openFeed } from '../qa/app';

// ACCEPTANCE C8–C9 (round 2): the backend waits for the reader, and the first data request stays
// small however many articles are published. Results feed tests/qa/metric.mjs.
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true };
const OUT = path.resolve(process.cwd(), 'test-results/qa/latency.json');

function record(patch: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  let cur: Record<string, unknown> = {};
  try {
    cur = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {}
  fs.writeFileSync(OUT, JSON.stringify({ ...cur, ...patch }, null, 2));
}

const backendMarks = (page: import('@playwright/test').Page) =>
  page.evaluate(() => performance.getEntriesByName('reader:backend-start').length);

test.describe('Round 2 C8–C9: latency', () => {
  test('C8: the backend does not start before the reader acts, and starts on a like', async ({ browser }) => {
    const context = await newQaContext(browser, PHONE);
    const page = await context.newPage();
    await openFeed(page);
    await page.waitForTimeout(6000);
    const before = await backendMarks(page);
    record({ backendBeforeInteraction: before });
    expect(before, 'reader:backend-start before any input').toBe(0);

    const like = page.locator('section.article[data-active="true"] .view.cover .rail button[aria-pressed]').first();
    await like.click();
    await expect.poll(() => backendMarks(page), { timeout: 1000, intervals: [50] }).toBe(1);
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    await context.close();
  });

  test('C9: the first data request is the feed head, small enough, and the feed continues past it', async ({ browser }) => {
    const context = await newQaContext(browser, PHONE);
    const page = await context.newPage();
    const errors = collectConsoleErrors(page);
    const dataRequests: string[] = [];
    page.on('request', (r) => {
      const p = new URL(r.url()).pathname;
      if (p.startsWith('/data/')) dataRequests.push(p);
    });
    await openFeed(page);
    expect(dataRequests[0]).toBe('/data/feed-head.json');

    const head = fs.readFileSync(path.resolve(process.cwd(), 'out/data/feed-head.json'));
    const headKbGz = zlib.gzipSync(head, { level: 9 }).length / 1024;
    record({ feedHeadKbGz: Number(headKbGz.toFixed(1)) });
    expect(headKbGz).toBeLessThanOrEqual(25);

    // The full list arrives while the reader is on the first screens.
    await expect.poll(() => dataRequests.includes('/data/feed.json'), { timeout: 5000 }).toBe(true);

    const active = () => page.locator('section.article[data-active="true"]').getAttribute('data-slug');
    const seen = [await active()];
    // Through the day's batch (lib/recommend BATCH, 30): past it is the end card, by design.
    for (let i = 0; i < 29; i++) {
      const prev = seen.at(-1);
      await page.keyboard.press('ArrowDown');
      await expect.poll(active, { timeout: 3000 }).not.toBe(prev);
      seen.push(await active());
    }
    expect(seen.every((s) => s && s !== '__end')).toBe(true);
    // A new reader's batch is the 30 newest, which the head holds: no longer a test of reaching past it.
    expect(new Set(seen).size).toBe(30);
    expect(errors).toEqual([]);
    await context.close();
  });
});
