import { expect, test, type Page } from '@playwright/test';

const article = (page: Page, n: number) => page.locator(`section[aria-posinset="${n}"]`);

async function openFeed(page: Page, path = '/') {
  await page.goto(path);
  await expect(article(page, 1).locator('.view.cover .ctitle')).toBeVisible();
}

async function topOf(page: Page, n: number) {
  const box = await article(page, n).boundingBox();
  return box?.y ?? Number.NaN;
}

test('the feed opens on an article cover', async ({ page }) => {
  await openFeed(page);
  await expect(article(page, 1).locator('.rail')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
});

test('arrow keys move between articles and views', async ({ page }) => {
  await openFeed(page);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => topOf(page, 2)).toBeLessThan(2);

  await page.keyboard.press('ArrowRight');
  const second = article(page, 2);
  await expect(second.locator('.view.details')).toHaveAttribute('aria-hidden', 'false');
  await expect(second.locator('.dpill')).toHaveText('Details');

  await page.keyboard.press('ArrowRight');
  await expect(second.locator('.view.engage')).toHaveAttribute('aria-hidden', 'false');
  await expect(second.getByText('Turn what you read into what you do.')).toBeVisible();

  await page.keyboard.press('ArrowUp');
  await expect.poll(() => topOf(page, 2)).toBeLessThan(2);
});

// Real touch input through the DevTools protocol, the way a finger drags on a phone.
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x, y) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('swipes move between articles and views', async ({ page }) => {
  await openFeed(page);
  const { width, height } = page.viewportSize()!;
  // More than half a screen, so the page turns by distance even if a busy machine delays the
  // release past the 100 ms velocity window (a slow drag under half a screen springs back).
  await swipe(page, { x: width / 2, y: height * 0.82 }, { x: width / 2, y: height * 0.22 });
  await expect.poll(() => topOf(page, 2)).toBeLessThan(2);

  await swipe(page, { x: width * 0.8, y: height / 2 }, { x: width * 0.2, y: height / 2 });
  await expect(article(page, 2).locator('.view.details')).toHaveAttribute('aria-hidden', 'false');
});

test('liking an article is remembered', async ({ page }) => {
  await openFeed(page);
  const like = article(page, 1).locator('.view.cover .rail button[aria-pressed]').first();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(article(page, 1).locator('.view.cover .rail button[aria-pressed]').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('switching to Vietnamese translates the interface', async ({ page }) => {
  await openFeed(page);
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitemradio', { name: /Tiếng Việt/ }).click();
  await expect(page.getByRole('button', { name: 'Tìm kiếm' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tìm kiếm' })).toBeVisible();
});

test('search finds an article and opens it', async ({ page }) => {
  await openFeed(page);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByLabel('Search articles or terms').fill('black hole');
  const result = page.getByRole('button', { name: /^The anatomy of a black hole/ });
  await expect(result).toBeVisible();
  await result.click();
  await expect(
    page.locator('section .view.cover .ctitle', { hasText: 'The anatomy of a black hole' }),
  ).toBeInViewport();
});

test('an article link opens that article', async ({ page }) => {
  await openFeed(page, '/a/our-moon');
  await expect(
    page.locator('section .view.cover .ctitle', { hasText: 'Surprising facts about our Moon' }),
  ).toBeInViewport();
});

test('article pages are readable without JavaScript', async ({ request }) => {
  const res = await request.get('/a/our-moon');
  expect(res.ok()).toBeTruthy();
  const html = await res.text();
  expect(html).toContain('Galileo Galilei');
  expect(html).toContain('Surprising facts about our Moon');
});

test('about, privacy and terms pages load (Google OAuth branding)', async ({ page }) => {
  for (const path of ['/about', '/privacy', '/terms']) {
    const res = await page.goto(path);
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('h1').first()).toBeVisible();
  }
  await page.goto('/about');
  await expect(page.locator('a[href="/privacy"]').first()).toBeVisible();
  const logo = await page.request.get('/icons/logo-120.png');
  expect(logo.ok()).toBeTruthy();
});

test('tapping the Details hint does not shift the screen sideways', async ({ page }) => {
  await page.goto('/a/smarter-decisions');
  await page.locator('section.article').first().locator('.view.cover .hint').first().click();
  await page.waitForTimeout(800);
  const shifted = await page.evaluate(() => [...document.querySelectorAll('*')].some((e) => e.scrollLeft > 0));
  expect(shifted).toBe(false);
});
