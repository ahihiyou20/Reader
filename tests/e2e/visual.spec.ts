import { expect, test } from '@playwright/test';
import { newQaContext } from '../qa/app';
import { MATRIX } from '../qa/viewports';

const VISUAL_VIEWPORTS = MATRIX.filter(
  (vp) => vp.name === 'iphone-portrait' || vp.name === 'se-portrait',
);

for (const vp of VISUAL_VIEWPORTS) {
  test(`visual screenshots at ${vp.name}`, async ({ browser }) => {
    const context = await newQaContext(browser, vp, { deviceScaleFactor: 1 });
    const page = await context.newPage();
    try {
      // Pinned to one article: the feed order changes every day as new articles are published.
      await page.goto('/a/around-half-of-people-will-experience-a-mental-health-issue');
      await expect(page.locator('.view.cover .ctitle').first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot('cover-' + vp.name + '.png');

      await page.keyboard.press('ArrowRight');
      await page.evaluate(() => {
        const scroller = document.querySelector('.dscroll');
        if (scroller) {
          scroller.scrollTop = 0;
        }
      });
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot('details-' + vp.name + '.png');

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot('engage-' + vp.name + '.png');
    } finally {
      await context.close();
    }
  });
}
