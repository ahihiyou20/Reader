import { expect, test, type Page } from '@playwright/test';
import { goToView, newQaContext, nextFrames, openFeed } from '../qa/app';
import {
  getTweenedProperties,
  startSampling,
  stopSampling,
} from '../qa/motion-sampler';

test.describe('TESTSPEC §10 / ACCEPTANCE 21–24: Reading', () => {
  const progressViewports = [
    { name: '390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: '1440x900', width: 1440, height: 900, isMobile: false, hasTouch: false },
  ];

  for (const vp of progressViewports) {
    test(`reading progress hairline matches scroll progress within 2% (${vp.name})`, async ({
      browser,
    }) => {
      const context = await newQaContext(browser, vp);
      const page = await context.newPage();

      await openFeed(page);
      await goToView(page, 'details');
      await page.waitForSelector('.dscroll');

      const progressElement = page.locator('[data-reading-progress]');
      await expect(progressElement, 'Progress hairline [data-reading-progress] must exist').toBeAttached();

      const ratios = [0, 0.25, 0.5, 1.0];

      for (const ratio of ratios) {
        await page.evaluate(
          ({ r }) => {
            const root = document.querySelector('.dscroll');
            if (root) {
              const maxScroll = root.scrollHeight - root.clientHeight;
              root.scrollTop = Math.round(maxScroll * r);
              root.dispatchEvent(new Event('scroll'));
            }
          },
          { r: ratio },
        );

        await nextFrames(page, 2);

        const scaleX = await page.evaluate(() => {
          const el = document.querySelector('[data-reading-progress]');
          if (!el) return null;
          const tr = window.getComputedStyle(el).transform;
          if (!tr || tr === 'none') return 1;
          const m = tr.match(/^matrix\(([^,]+),\s*([^,]+)/);
          if (m) {
            return Math.hypot(parseFloat(m[1]), parseFloat(m[2]));
          }
          const m3d = tr.match(/^matrix3d\(([^,]+),\s*([^,]+)/);
          if (m3d) {
            return Math.hypot(parseFloat(m3d[1]), parseFloat(m3d[2]));
          }
          return null;
        });

        expect(scaleX, `scaleX at ratio ${ratio}`).not.toBeNull();
        expect(
          Math.abs((scaleX ?? 0) - ratio),
          `scaleX (${scaleX}) matches scroll ratio (${ratio}) within ±0.02`,
        ).toBeLessThanOrEqual(0.02);
      }

      await context.close();
    });
  }

  test('KEY POINT sweep plays once and never replays', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    await openFeed(page);
    await goToView(page, 'details');
    await page.waitForSelector('.dscroll');

    await startSampling(page);

    // Scroll KEY POINT into the reading line: scrollTop + 0.42 * clientHeight
    await page.evaluate(() => {
      const root = document.querySelector('.dscroll');
      const kp =
        document.querySelector('[data-sweep]') ||
        document.querySelector('.kp') ||
        document.querySelector('.sec.last');
      if (root && kp) {
        const kpTop = (kp as HTMLElement).offsetTop;
        root.scrollTop = Math.max(0, kpTop - root.clientHeight * 0.42);
        root.dispatchEvent(new Event('scroll'));
      }
    });

    await page.waitForTimeout(1000);

    const firstSweepCount = await countSweepAnimations(page);
    expect(firstSweepCount, 'First sweep animation on [data-sweep] count = 1').toBe(1);

    // Scroll back to top
    await page.evaluate(() => {
      const root = document.querySelector('.dscroll');
      if (root) {
        root.scrollTop = 0;
        root.dispatchEvent(new Event('scroll'));
      }
    });
    await page.waitForTimeout(1000);

    // Scroll back to KEY POINT on the reading line
    await page.evaluate(() => {
      const root = document.querySelector('.dscroll');
      const kp =
        document.querySelector('[data-sweep]') ||
        document.querySelector('.kp') ||
        document.querySelector('.sec.last');
      if (root && kp) {
        const kpTop = (kp as HTMLElement).offsetTop;
        root.scrollTop = Math.max(0, kpTop - root.clientHeight * 0.42);
        root.dispatchEvent(new Event('scroll'));
      }
    });
    await page.waitForTimeout(1000);

    const secondSweepCount = await countSweepAnimations(page);
    expect(secondSweepCount, 'Sweep animation on [data-sweep] is still 1 (never replayed)').toBe(1);

    await stopSampling(page);
    await context.close();
  });

  const cmp09Viewports = [
    { name: '390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: '844x390', width: 844, height: 390, isMobile: true, hasTouch: true },
    { name: '1440x900', width: 1440, height: 900, isMobile: false, hasTouch: false },
  ];

  for (const vp of cmp09Viewports) {
    test(`CMP-09 focus-follow in Details view (${vp.name})`, async ({ browser }) => {
      const context = await newQaContext(browser, vp);
      const page = await context.newPage();

      await openFeed(page);
      await goToView(page, 'details');
      await page.waitForSelector('.dscroll');

      await nextFrames(page, 3);

      const blockInfo = await page.evaluate(() => {
        const root = document.querySelector('.dscroll');
        if (!root) return null;
        const line = root.scrollTop + root.clientHeight * 0.42;
        const blocks = Array.from(
          document.querySelectorAll('.dscroll [data-k]'),
        ) as HTMLElement[];
        if (blocks.length === 0) return null;

        let activeIdx = 0;
        for (let i = 0; i < blocks.length; i++) {
          if (blocks[i].offsetTop <= line) {
            activeIdx = i;
          }
        }

        const activeBlock = blocks[activeIdx];
        const activeClass = activeBlock.className;
        const activeOpacity = parseFloat(window.getComputedStyle(activeBlock).opacity);

        const twoAwayIdx =
          activeIdx + 2 < blocks.length ? activeIdx + 2 : activeIdx - 2;
        let twoAwayOpacity = 1;
        let hasTwoAway = false;
        if (twoAwayIdx >= 0 && twoAwayIdx < blocks.length) {
          hasTwoAway = true;
          twoAwayOpacity = parseFloat(
            window.getComputedStyle(blocks[twoAwayIdx]).opacity,
          );
        }

        return {
          totalBlocks: blocks.length,
          activeIdx,
          activeClass,
          activeOpacity,
          hasTwoAway,
          twoAwayIdx,
          twoAwayOpacity,
        };
      });

      expect(blockInfo, 'Reading blocks found in Details view').not.toBeNull();
      expect(blockInfo!.totalBlocks).toBeGreaterThanOrEqual(3);
      expect(blockInfo!.activeClass).toMatch(/\bon\b/);
      expect(blockInfo!.activeOpacity).toBeGreaterThanOrEqual(0.95);
      expect(blockInfo!.hasTwoAway).toBe(true);
      expect(blockInfo!.twoAwayOpacity).toBeLessThanOrEqual(0.5);

      await context.close();
    });
  }

  test('reduced motion disables transform animations and preserves final opacity', async ({
    browser,
  }) => {
    const context = await newQaContext(
      browser,
      { width: 390, height: 844, isMobile: true, hasTouch: true },
      { reducedMotion: 'reduce' },
    );
    const page = await context.newPage();

    await openFeed(page);
    await startSampling(page);

    // 1. feed swipe
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);

    // 2. view change
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);

    // 3. open Explore and close
    const exploreBtn = page.locator('.topbar button.tb-ic:has(svg.lucide-compass), .crow .gridbtn').first();
    if (await exploreBtn.count() > 0) {
      await exploreBtn.click();
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // 4. like
    const likeBtn = page.locator('.rail button').first();
    if (await likeBtn.count() > 0) {
      await likeBtn.click();
      await page.waitForTimeout(200);
    }

    // 5. rotation
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);

    const result = await stopSampling(page);

    // Assert no recorded animation with a transform-family property lasting > 1ms
    const transformProperties = new Set(['transform', 'translate', 'scale', 'rotate']);
    for (const anim of result.animations) {
      const hasTransform = anim.properties.some((p) =>
        transformProperties.has(p.trim().toLowerCase()),
      );
      if (hasTransform) {
        const dur =
          typeof anim.duration === 'number'
            ? anim.duration
            : parseFloat(String(anim.duration));
        expect(
          dur,
          `Transform animation on "${anim.target}" must not last > 1ms in reduced motion`,
        ).toBeLessThanOrEqual(1);
      }
    }

    // Assert no element's transform is tweened after gesture is released
    const tweenedProps = getTweenedProperties(result);
    const tweenedTransforms = tweenedProps.filter((t) =>
      transformProperties.has(t.property.trim().toLowerCase()),
    );
    expect(
      tweenedTransforms,
      'No element transform is tweened in reduced motion mode',
    ).toHaveLength(0);

    // Afterwards, assert the KEY POINT text and Details text have computed opacity > 0.9 where expected
    await goToView(page, 'details');
    await page.waitForSelector('.dscroll');
    await nextFrames(page, 3);

    // Details focused text opacity > 0.9
    const activeTextOpacity = await page.evaluate(() => {
      const onBlock = document.querySelector('.dscroll [data-k].on');
      if (!onBlock) return null;
      return parseFloat(window.getComputedStyle(onBlock).opacity);
    });
    expect(activeTextOpacity, 'Focused Details text opacity > 0.9').not.toBeNull();
    expect(activeTextOpacity!).toBeGreaterThan(0.9);

    // Scroll KEY POINT into view
    await page.evaluate(() => {
      const root = document.querySelector('.dscroll');
      const kp =
        document.querySelector('.kp') ||
        document.querySelector('[data-sweep]') ||
        document.querySelector('.sec.last');
      if (root && kp) {
        const kpTop = (kp as HTMLElement).offsetTop;
        root.scrollTop = Math.max(0, kpTop - root.clientHeight * 0.42);
        root.dispatchEvent(new Event('scroll'));
      }
    });
    await nextFrames(page, 3);

    const kpOpacity = await page.evaluate(() => {
      const kp =
        document.querySelector('.kp') ||
        document.querySelector('[data-sweep]') ||
        document.querySelector('.sec.last');
      if (!kp) return null;
      return parseFloat(window.getComputedStyle(kp).opacity);
    });
    expect(kpOpacity, 'KEY POINT opacity > 0.9').not.toBeNull();
    expect(kpOpacity!).toBeGreaterThan(0.9);

    await context.close();
  });
});

async function countSweepAnimations(page: Page): Promise<number> {
  return await page.evaluate(() => {
    type SamplingWindow = typeof window & {
      __qaAnimations?: Array<{ target: string; pseudoElement: string }>;
      __qaStyleChanges?: Array<{ element: string; property: string }>;
    };
    const win = window as unknown as SamplingWindow;
    const anims = win.__qaAnimations || [];
    const changes = win.__qaStyleChanges || [];

    let count = 0;
    const sweepAnims = anims.filter(
      (a) =>
        a.target.includes('[data-sweep') ||
        a.target.includes('data-sweep') ||
        a.pseudoElement.includes('sweep'),
    );
    count += sweepAnims.length;

    const sweepChanges = changes.filter(
      (c) => c.element.includes('[data-sweep') || c.element.includes('data-sweep'),
    );
    if (sweepChanges.length >= 3) {
      count += 1;
    }

    return count;
  });
}
