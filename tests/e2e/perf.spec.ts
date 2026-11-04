import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { newQaContext, openFeed } from '../qa/app';

export interface PerfRecordingResult {
  intervals: number[];
  longTasks: number[];
}

export interface RunData {
  run: number;
  p95: number;
  maxLongTask: number;
  sampleCount: number;
}

export interface FlowData {
  name: string;
  viewport: string;
  p95: number;
  maxLongTask: number;
  runs: RunData[];
}

function computeP95(intervals: number[]): number {
  if (intervals.length === 0) {
    throw new Error('computeP95: intervals list is empty');
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx];
}

function computeMedian(values: number[]): number {
  if (values.length === 0) {
    throw new Error('computeMedian: values list is empty');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    type QAWindow = Window & {
      __qaPerfRecording?: boolean;
      __qaRafIntervals?: number[];
      __qaLongTasks?: number[];
      __qaLongTaskObserver?: PerformanceObserver;
      __qaLastRafTime?: number;
    };
    const win = window as unknown as QAWindow;
    win.__qaPerfRecording = true;
    win.__qaRafIntervals = [];
    win.__qaLongTasks = [];
    win.__qaLastRafTime = 0;

    if (!win.__qaLongTaskObserver && 'PerformanceObserver' in window) {
      try {
        win.__qaLongTaskObserver = new PerformanceObserver((list) => {
          if (!win.__qaPerfRecording) return;
          for (const entry of list.getEntries()) {
            win.__qaLongTasks?.push(entry.duration);
          }
        });
        win.__qaLongTaskObserver.observe({ entryTypes: ['longtask'] });
      } catch {
        // LongTask observer not supported
      }
    }

    function step(now: number) {
      if (!win.__qaPerfRecording) return;
      if (win.__qaLastRafTime && win.__qaLastRafTime > 0) {
        win.__qaRafIntervals?.push(now - win.__qaLastRafTime);
      }
      win.__qaLastRafTime = now;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

async function stopRecording(page: Page): Promise<PerfRecordingResult> {
  return await page.evaluate(() => {
    type QAWindow = Window & {
      __qaPerfRecording?: boolean;
      __qaRafIntervals?: number[];
      __qaLongTasks?: number[];
    };
    const win = window as unknown as QAWindow;
    win.__qaPerfRecording = false;
    return {
      intervals: win.__qaRafIntervals || [],
      longTasks: win.__qaLongTasks || [],
    };
  });
}

async function countVisibleBackdropFilters(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('*'));
    let count = 0;
    for (const el of all) {
      const style = window.getComputedStyle(el);
      const bf =
        style.backdropFilter ||
        (style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter ||
        'none';
      if (bf && bf !== 'none') {
        const rect = el.getBoundingClientRect();
        const onScreen =
          rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
        if (rect.width > 0 && rect.height > 0 && onScreen) {
          let curr: Element | null = el;
          let visible = true;
          let opacity = 1;
          while (curr) {
            const s = window.getComputedStyle(curr);
            if (s.visibility === 'hidden' || s.display === 'none') {
              visible = false;
              break;
            }
            const op = parseFloat(s.opacity);
            if (!Number.isNaN(op)) opacity *= op;
            curr = curr.parentElement;
          }
          if (visible && opacity >= 0.05) {
            count++;
          }
        }
      }
    }
    return count;
  });
}

async function countWillChangeAtRest(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>('*'));
    let count = 0;
    for (const el of all) {
      const style = window.getComputedStyle(el);
      const wc = style.willChange;
      if (wc && wc !== 'auto') {
        count++;
      }
    }
    return count;
  });
}

async function openExplore(page: Page): Promise<void> {
  const exploreBtn = page.getByRole('button', { name: /explore|khám phá/i }).first();
  const count = await exploreBtn.count();
  if (count > 0) {
    await exploreBtn.click();
  } else {
    await page.locator('header.topbar button.tb-ic:not(.bell)').first().click();
  }
  await page.waitForSelector('.panel', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(300);
}

test.describe.serial('performance tests', () => {
  test('frame intervals p95 and long tasks across touch and mouse flows', async ({ browser }: { browser: Browser }) => {
    const flows: FlowData[] = [];

    // ==========================================
    // 1. Mobile touch flows (390x844)
    // ==========================================
    const mobileContext: BrowserContext = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const mobilePage: Page = await mobileContext.newPage();
      await openFeed(mobilePage);

      // Flow 1.1: Mobile feed swipe
      {
        const runs: RunData[] = [];
        const cdp = await mobileContext.newCDPSession(mobilePage);
        const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];

        for (let r = 0; r < 3; r++) {
          const isUp = r % 2 === 0;
          const startY = isUp ? 600 : 250;
          const endY = isUp ? 250 : 600;
          const x = 195;
          const steps = 8;

          await startRecording(mobilePage);

          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: point(x, startY),
          });
          for (let i = 1; i <= steps; i++) {
            const y = startY + ((endY - startY) * i) / steps;
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: point(x, y),
            });
            await mobilePage.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
          await mobilePage.waitForTimeout(700);

          const rec = await stopRecording(mobilePage);
          const runP95 = computeP95(rec.intervals);
          const runMaxLT = rec.longTasks.length > 0 ? Math.max(0, ...rec.longTasks) : 0;
          runs.push({
            run: r + 1,
            p95: Math.round(runP95 * 100) / 100,
            maxLongTask: Math.round(runMaxLT * 100) / 100,
            sampleCount: rec.intervals.length,
          });
        }
        await cdp.detach();

        const flowP95 = computeMedian(runs.map((r) => r.p95));
        const flowMaxLT = runs.length > 0 ? Math.max(0, ...runs.map((r) => r.maxLongTask)) : 0;
        flows.push({
          name: 'feed swipe',
          viewport: '390x844 (touch)',
          p95: Math.round(flowP95 * 100) / 100,
          maxLongTask: Math.round(flowMaxLT * 100) / 100,
          runs,
        });
      }

      // Flow 1.2: Mobile view swipe
      {
        const runs: RunData[] = [];
        const cdp = await mobileContext.newCDPSession(mobilePage);
        const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];

        for (let r = 0; r < 3; r++) {
          const isLeft = r % 2 === 0;
          const startX = isLeft ? 320 : 70;
          const endX = isLeft ? 70 : 320;
          const y = 420;
          const steps = 8;

          await startRecording(mobilePage);

          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: point(startX, y),
          });
          for (let i = 1; i <= steps; i++) {
            const x = startX + ((endX - startX) * i) / steps;
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: point(x, y),
            });
            await mobilePage.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
          await mobilePage.waitForTimeout(700);

          const rec = await stopRecording(mobilePage);
          const runP95 = computeP95(rec.intervals);
          const runMaxLT = rec.longTasks.length > 0 ? Math.max(0, ...rec.longTasks) : 0;
          runs.push({
            run: r + 1,
            p95: Math.round(runP95 * 100) / 100,
            maxLongTask: Math.round(runMaxLT * 100) / 100,
            sampleCount: rec.intervals.length,
          });
        }
        await cdp.detach();

        const flowP95 = computeMedian(runs.map((r) => r.p95));
        const flowMaxLT = runs.length > 0 ? Math.max(0, ...runs.map((r) => r.maxLongTask)) : 0;
        flows.push({
          name: 'view swipe',
          viewport: '390x844 (touch)',
          p95: Math.round(flowP95 * 100) / 100,
          maxLongTask: Math.round(flowMaxLT * 100) / 100,
          runs,
        });
      }

      // Flow 1.3: Mobile Explore panel drag-to-dismiss
      {
        const runs: RunData[] = [];
        const cdp = await mobileContext.newCDPSession(mobilePage);
        const point = (x: number, y: number) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];

        for (let r = 0; r < 3; r++) {
          await openExplore(mobilePage);

          await startRecording(mobilePage);

          const startX = 60;
          const endX = 350;
          const y = 300;
          const steps = 8;

          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: point(startX, y),
          });
          for (let i = 1; i <= steps; i++) {
            const x = startX + ((endX - startX) * i) / steps;
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: point(x, y),
            });
            await mobilePage.waitForTimeout(16);
          }
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
          await mobilePage.waitForTimeout(700);

          const rec = await stopRecording(mobilePage);
          const runP95 = computeP95(rec.intervals);
          const runMaxLT = rec.longTasks.length > 0 ? Math.max(0, ...rec.longTasks) : 0;
          runs.push({
            run: r + 1,
            p95: Math.round(runP95 * 100) / 100,
            maxLongTask: Math.round(runMaxLT * 100) / 100,
            sampleCount: rec.intervals.length,
          });

          const panelCount = await mobilePage.locator('.panel').count();
          if (panelCount > 0) {
            await mobilePage.keyboard.press('Escape');
            await mobilePage.waitForTimeout(300);
          }
        }
        await cdp.detach();

        const flowP95 = computeMedian(runs.map((r) => r.p95));
        const flowMaxLT = runs.length > 0 ? Math.max(0, ...runs.map((r) => r.maxLongTask)) : 0;
        flows.push({
          name: 'Explore panel drag-to-dismiss',
          viewport: '390x844 (touch)',
          p95: Math.round(flowP95 * 100) / 100,
          maxLongTask: Math.round(flowMaxLT * 100) / 100,
          runs,
        });
      }

      // Flow 1.4: Mobile rotation (390x844 -> 844x390)
      {
        const runs: RunData[] = [];

        for (let r = 0; r < 3; r++) {
          const isLandscape = r % 2 === 0;
          const targetW = isLandscape ? 844 : 390;
          const targetH = isLandscape ? 390 : 844;

          await startRecording(mobilePage);
          await mobilePage.setViewportSize({ width: targetW, height: targetH });
          // The CDP resize itself can take a few hundred ms; observe long enough to collect 20+ frames.
          await mobilePage.waitForTimeout(1500);

          const rec = await stopRecording(mobilePage);
          const runP95 = computeP95(rec.intervals);
          const runMaxLT = rec.longTasks.length > 0 ? Math.max(0, ...rec.longTasks) : 0;
          runs.push({
            run: r + 1,
            p95: Math.round(runP95 * 100) / 100,
            maxLongTask: Math.round(runMaxLT * 100) / 100,
            sampleCount: rec.intervals.length,
          });
        }

        await mobilePage.setViewportSize({ width: 390, height: 844 });
        await mobilePage.waitForTimeout(300);

        const flowP95 = computeMedian(runs.map((r) => r.p95));
        const flowMaxLT = runs.length > 0 ? Math.max(0, ...runs.map((r) => r.maxLongTask)) : 0;
        flows.push({
          name: 'rotation',
          viewport: '390x844 (touch)',
          p95: Math.round(flowP95 * 100) / 100,
          maxLongTask: Math.round(flowMaxLT * 100) / 100,
          runs,
        });
      }
    } finally {
      await mobileContext.close();
    }

    // ==========================================
    // 2. Desktop mouse flows (1440x900)
    // ==========================================
    const desktopContext: BrowserContext = await newQaContext(browser, {
      width: 1440,
      height: 900,
      isMobile: false,
      hasTouch: false,
    });
    try {
      const desktopPage: Page = await desktopContext.newPage();
      await openFeed(desktopPage);

      // Flow 2.1: Desktop feed swipe (wheel)
      {
        const runs: RunData[] = [];

        for (let r = 0; r < 3; r++) {
          const isDown = r % 2 === 0;
          const deltaY = isDown ? 300 : -300;

          await startRecording(desktopPage);
          await desktopPage.mouse.move(720, 450);
          await desktopPage.mouse.wheel(0, deltaY);
          await desktopPage.waitForTimeout(700);

          const rec = await stopRecording(desktopPage);
          const runP95 = computeP95(rec.intervals);
          const runMaxLT = rec.longTasks.length > 0 ? Math.max(0, ...rec.longTasks) : 0;
          runs.push({
            run: r + 1,
            p95: Math.round(runP95 * 100) / 100,
            maxLongTask: Math.round(runMaxLT * 100) / 100,
            sampleCount: rec.intervals.length,
          });
        }

        const flowP95 = computeMedian(runs.map((r) => r.p95));
        const flowMaxLT = runs.length > 0 ? Math.max(0, ...runs.map((r) => r.maxLongTask)) : 0;
        flows.push({
          name: 'feed swipe',
          viewport: '1440x900 (mouse)',
          p95: Math.round(flowP95 * 100) / 100,
          maxLongTask: Math.round(flowMaxLT * 100) / 100,
          runs,
        });
      }

      // Flow 2.2: Desktop view swipe (wheel)
      {
        const runs: RunData[] = [];

        for (let r = 0; r < 3; r++) {
          const isRight = r % 2 === 0;
          const deltaX = isRight ? 300 : -300;

          await startRecording(desktopPage);
          await desktopPage.mouse.move(720, 450);
          await desktopPage.mouse.wheel(deltaX, 0);
          await desktopPage.waitForTimeout(700);

          const rec = await stopRecording(desktopPage);
          const runP95 = computeP95(rec.intervals);
          const runMaxLT = rec.longTasks.length > 0 ? Math.max(0, ...rec.longTasks) : 0;
          runs.push({
            run: r + 1,
            p95: Math.round(runP95 * 100) / 100,
            maxLongTask: Math.round(runMaxLT * 100) / 100,
            sampleCount: rec.intervals.length,
          });
        }

        const flowP95 = computeMedian(runs.map((r) => r.p95));
        const flowMaxLT = runs.length > 0 ? Math.max(0, ...runs.map((r) => r.maxLongTask)) : 0;
        flows.push({
          name: 'view swipe',
          viewport: '1440x900 (mouse)',
          p95: Math.round(flowP95 * 100) / 100,
          maxLongTask: Math.round(flowMaxLT * 100) / 100,
          runs,
        });
      }

      // Flow 2.3: Desktop Explore panel drag-to-dismiss
      {
        const runs: RunData[] = [];

        for (let r = 0; r < 3; r++) {
          await openExplore(desktopPage);

          await startRecording(desktopPage);

          await desktopPage.mouse.move(100, 300);
          await desktopPage.mouse.down();
          for (let i = 1; i <= 8; i++) {
            const x = 100 + ((600 - 100) * i) / 8;
            await desktopPage.mouse.move(x, 300);
            await desktopPage.waitForTimeout(16);
          }
          await desktopPage.mouse.up();
          await desktopPage.waitForTimeout(700);

          const rec = await stopRecording(desktopPage);
          const runP95 = computeP95(rec.intervals);
          const runMaxLT = rec.longTasks.length > 0 ? Math.max(0, ...rec.longTasks) : 0;
          runs.push({
            run: r + 1,
            p95: Math.round(runP95 * 100) / 100,
            maxLongTask: Math.round(runMaxLT * 100) / 100,
            sampleCount: rec.intervals.length,
          });

          const panelCount = await desktopPage.locator('.panel').count();
          if (panelCount > 0) {
            await desktopPage.keyboard.press('Escape');
            await desktopPage.waitForTimeout(300);
          }
        }

        const flowP95 = computeMedian(runs.map((r) => r.p95));
        const flowMaxLT = runs.length > 0 ? Math.max(0, ...runs.map((r) => r.maxLongTask)) : 0;
        flows.push({
          name: 'Explore panel drag-to-dismiss',
          viewport: '1440x900 (mouse)',
          p95: Math.round(flowP95 * 100) / 100,
          maxLongTask: Math.round(flowMaxLT * 100) / 100,
          runs,
        });
      }
    } finally {
      await desktopContext.close();
    }

    // ==========================================
    // Aggregation and Output
    // ==========================================
    // A stage change needs two full relayouts by design (the View Transition's old snapshot at the new
    // size, then the new stage), so rotation is judged on its own budget; gestures keep the strict one.
    const rotation = flows.find((f) => f.name === 'rotation');
    const gestures = flows.filter((f) => f.name !== 'rotation');
    const flowP95s = gestures.map((f) => f.p95);
    if (flowP95s.length === 0 || !rotation) {
      throw new Error('gesture or rotation flows missing; cannot compute overall p95');
    }
    const overallP95 = Math.round(Math.max(...flowP95s) * 100) / 100;

    const flowMaxLTs = gestures.map((f) => f.maxLongTask);
    const overallMaxLT =
      flowMaxLTs.length > 0 ? Math.round(Math.max(0, ...flowMaxLTs) * 100) / 100 : 0;

    const qaDir = path.resolve(process.cwd(), 'test-results/qa');
    if (!fs.existsSync(qaDir)) {
      fs.mkdirSync(qaDir, { recursive: true });
    }
    const perfFilePath = path.join(qaDir, 'perf.json');

    const perfData = {
      p95: overallP95,
      maxLongTask: overallMaxLT,
      rotation: { p95: rotation.p95, maxLongTask: rotation.maxLongTask },
      flows,
    };
    fs.writeFileSync(perfFilePath, JSON.stringify(perfData, null, 2), 'utf8');

    console.log(`PERF BASELINE: p95 = ${overallP95}ms, maxLongTask = ${overallMaxLT}ms`);

    expect(flows).toHaveLength(7);
    for (const flow of flows) {
      expect(flow.runs.length).toBeGreaterThan(0);
      for (const run of flow.runs) {
        // 20 frames is about a third of a second of a gesture: enough for a p95, never an empty run.
        expect(run.sampleCount, `${flow.name} at ${flow.viewport}, run ${run.run}`).toBeGreaterThanOrEqual(20);
      }
    }

    expect(overallP95).toBeLessThanOrEqual(20);
    expect(overallMaxLT).toBeLessThanOrEqual(50);
    expect(rotation.p95).toBeLessThanOrEqual(80);
    expect(rotation.maxLongTask).toBeLessThanOrEqual(80);
  });

  test('surface and will-change checks at rest and with Explore open', async ({ browser }: { browser: Browser }) => {
    const context: BrowserContext = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page: Page = await context.newPage();
      await openFeed(page);

      const atRestBF = await countVisibleBackdropFilters(page);
      expect(atRestBF).toBeLessThanOrEqual(9);

      const atRestWC = await countWillChangeAtRest(page);
      expect(atRestWC).toBeLessThanOrEqual(4);

      await openExplore(page);

      const exploreBF = await countVisibleBackdropFilters(page);
      expect(exploreBF).toBeLessThanOrEqual(6);
    } finally {
      await context.close();
    }
  });
});
