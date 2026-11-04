import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Browser, BrowserContext, Locator, Page } from '@playwright/test';
import type { FeedItem } from '@/lib/content/types';
import { MOTION_SAMPLER_SCRIPT } from './motion-sampler';

// Every cover image in the QA tests is this one fixture (a copy of the atomic-clocks cover the visual
// baselines were taken with), so results never depend on which articles are published that day.
const coverBytes = fs.readFileSync(path.resolve(process.cwd(), 'tests/qa/fixtures/cover.webp'));
const coverContentType = 'image/webp';

export interface QaContextOptions {
  readonly reducedMotion?: 'reduce' | 'no-preference';
  readonly javaScriptEnabled?: boolean;
  readonly deviceScaleFactor?: number;
}

export type FeedView = 'cover' | 'details' | 'engage' | 0 | 1 | 2;

/**
 * Creates a Playwright context configured with the QA routing rule:
 * off-localhost image requests are fulfilled with the first sorted cover;
 * all other off-localhost requests are aborted.
 */
export async function newQaContext(
  browser: Browser,
  vp: { width: number; height: number; isMobile?: boolean; hasTouch?: boolean },
  opts?: QaContextOptions,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    reducedMotion: opts?.reducedMotion,
    javaScriptEnabled: opts?.javaScriptEnabled ?? true,
    deviceScaleFactor: opts?.deviceScaleFactor ?? 1,
    baseURL: 'http://localhost:4173',
  });

  await context.addInitScript(MOTION_SAMPLER_SCRIPT);

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    // Self-hosted covers (public/covers, including the scripts/covers.mjs variants) get the same
    // fixture as remote covers, so screenshots do not depend on which articles are published.
    if (local && !url.pathname.startsWith('/covers/')) {
      await route.continue();
      return;
    }
    const isImg =
      route.request().resourceType() === 'image' ||
      /\.(webp|png|jpe?g|gif|svg|avif)(\?.*)?$/i.test(url.pathname);
    if (isImg) {
      await route.fulfill({
        status: 200,
        contentType: coverContentType,
        body: coverBytes,
      });
    } else {
      await route.abort('failed');
    }
  });

  return context;
}

/**
 * Opens the feed, waits for section.article[data-active="true"],
 * waits for document.fonts.ready, then waits 2 animation frames.
 */
export async function openFeed(page: Page, pathUrl = '/'): Promise<void> {
  await page.goto(pathUrl);
  await page.waitForSelector('section.article[data-active="true"]');
  await page.evaluate(() => document.fonts.ready);
  await nextFrames(page, 2);
}

/**
 * Returns a locator for the currently active article section.
 */
export function activeArticle(page: Page): Locator {
  return page.locator('section.article[data-active="true"]');
}

/**
 * Advances or retreats between Cover (0), Details (1), and Engage (2)
 * using keyboard arrows (ArrowRight / ArrowLeft).
 */
export async function goToView(page: Page, v: FeedView): Promise<void> {
  const targetIdx =
    typeof v === 'number' ? v : v === 'cover' ? 0 : v === 'details' ? 1 : 2;

  const currentIdx = await page.evaluate(() => {
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

  const diff = targetIdx - currentIdx;
  if (diff > 0) {
    for (let i = 0; i < diff; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
  } else if (diff < 0) {
    for (let i = 0; i < Math.abs(diff); i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(50);
    }
  }
  await nextFrames(page, 2);
}

/**
 * Waits for `n` animation frames in the page.
 */
export async function nextFrames(page: Page, n = 1): Promise<void> {
  await page.evaluate((count) => {
    return new Promise<void>((resolve) => {
      let remaining = count;
      function step() {
        remaining--;
        if (remaining <= 0) {
          resolve();
        } else {
          requestAnimationFrame(step);
        }
      }
      requestAnimationFrame(step);
    });
  }, n);
}

/**
 * Attaches console error and pageerror listeners to page, ignoring
 * net::ERR_FAILED caused by aborted off-host requests.
 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('net::ERR_FAILED')) return;
      errors.push(text);
    }
  });
  page.on('pageerror', (err) => {
    const text = err.message || String(err);
    if (text.includes('net::ERR_FAILED')) return;
    errors.push(text);
  });
  return errors;
}

/**
 * Reads /data/feed.json and returns the first FeedItem.
 */
export async function firstFeedItem(request: APIRequestContext): Promise<FeedItem> {
  const res = await request.get('/data/feed.json');
  if (!res.ok()) {
    throw new Error(`Failed to load /data/feed.json: ${res.status()}`);
  }
  const data = (await res.json()) as { items?: FeedItem[] } | FeedItem[];
  const items = Array.isArray(data) ? data : data.items;
  if (!items || items.length === 0) {
    throw new Error('No items returned from /data/feed.json');
  }
  return items[0];
}
