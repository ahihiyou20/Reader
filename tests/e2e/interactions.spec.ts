import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { goToView, newQaContext, nextFrames, openFeed } from '../qa/app';
import { MATRIX } from '../qa/viewports';

interface StyleSample {
  scale: number;
  opacity: number;
  backgroundColor: string;
  filter: string;
  color: string;
}

interface ElementSample {
  el: StyleSample;
  child: StyleSample | null;
}

interface CensusFailure {
  name: string;
  surface: string;
  viewport: string;
  reason?: string;
}

interface InteractionsJsonReport {
  pct: number;
  interaction_coverage_pct: number;
  total: number;
  passed: number;
  failures: CensusFailure[];
}

function writeInteractionsReport(report: InteractionsJsonReport): void {
  const dir = path.resolve(process.cwd(), 'test-results/qa');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'interactions.json'), JSON.stringify(report, null, 2), 'utf8');
}

function evaluatePass(
  rest: ElementSample,
  pressed: ElementSample,
  released: ElementSample,
): { passed: boolean; reason?: string } {
  const elChanged =
    pressed.el.scale <= 0.99 ||
    Math.abs(pressed.el.opacity - rest.el.opacity) >= 0.05 ||
    pressed.el.backgroundColor !== rest.el.backgroundColor ||
    pressed.el.filter !== rest.el.filter ||
    pressed.el.color !== rest.el.color;

  const childChanged =
    rest.child !== null &&
    pressed.child !== null &&
    (pressed.child.scale <= 0.99 ||
      Math.abs(pressed.child.opacity - rest.child.opacity) >= 0.05 ||
      pressed.child.backgroundColor !== rest.child.backgroundColor ||
      pressed.child.filter !== rest.child.filter ||
      pressed.child.color !== rest.child.color);

  const changed = elChanged || childChanged;
  if (!changed) {
    return { passed: false, reason: 'No property changed during press' };
  }

  const elReturned =
    Math.abs(released.el.scale - rest.el.scale) <= 0.005 &&
    Math.abs(released.el.opacity - rest.el.opacity) <= 0.02 &&
    released.el.backgroundColor === rest.el.backgroundColor &&
    released.el.color === rest.el.color;

  const childReturned =
    !rest.child ||
    !released.child ||
    (Math.abs(released.child.scale - rest.child.scale) <= 0.005 &&
      Math.abs(released.child.opacity - rest.child.opacity) <= 0.02 &&
      released.child.backgroundColor === rest.child.backgroundColor &&
      released.child.color === rest.child.color);

  const returned = elReturned && childReturned;
  if (!returned) {
    return { passed: false, reason: 'Failed to return to rest state after release' };
  }

  return { passed: true };
}

async function closeOpenOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const hasOpen = await page.evaluate(() => {
      const panel = document.querySelector('.panel:not([inert])');
      const sheet = document.querySelector('.sheet:not([inert]), [role="dialog"]:not([inert])');
      const menu = document.querySelector('.lmenu.open');
      return Boolean(panel || sheet || menu);
    });
    if (!hasOpen) break;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}

async function runPressCensusOnSurface(
  page: Page,
  cdp: CDPSession,
  surface: string,
  vpName: string,
): Promise<{ passed: number; total: number; failures: CensusFailure[] }> {
  const candidates = await page.evaluate((surf: string) => {
    let root: Element | null = null;
    if (surf === 'cover') {
      root = document.querySelector('section.article[data-active="true"] .view.cover');
    } else if (surf === 'details') {
      root = document.querySelector('section.article[data-active="true"] .view.details');
    } else if (surf === 'engage') {
      root = document.querySelector('section.article[data-active="true"] .view.engage');
    } else if (surf === 'lang-menu') {
      root = document.querySelector('[role="menu"], .lmenu');
    } else if (surf === 'sources-sheet') {
      root = document.querySelector('.sheet:not([inert]), [role="dialog"]:not([inert])');
    } else if (surf === 'explore') {
      root = document.querySelector('.panel[aria-label="Explore"], .panel:not([inert])');
    } else if (surf === 'search') {
      root = document.querySelector('.panel[aria-label="Search"], .panel:not([inert])');
    } else if (surf === 'messages') {
      root = document.querySelector('.panel[aria-label="Messages"], .panel:not([inert])');
    } else if (surf === 'notifications') {
      root = document.querySelector('.panel[aria-label="Notifications"], .panel:not([inert])');
    } else if (surf === 'profile') {
      root = document.querySelector('.panel:not([inert]), .sheet:not([inert])');
    } else if (surf === 'create') {
      root = document.querySelector('.panel:not([inert]), .sheet:not([inert])');
    } else if (surf === 'chrome') {
      root = document.body;
    }
    if (!root) return [];

    const selector =
      'button, a[href], [role="button"], [role="menuitemradio"], [role="tab"], input[type="checkbox"]';
    let elements = Array.from(root.querySelectorAll<HTMLElement>(selector));

    if (surf === 'chrome') {
      elements = elements.filter((el) => el.closest('header.topbar, nav.bnav'));
    }

    const valid: Array<{ index: number; name: string }> = [];
    let count = 0;
    for (const el of elements) {
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox') continue;
      if (el.tagName === 'TEXTAREA') continue;
      if ((el as HTMLButtonElement).disabled) continue;
      if (el.getAttribute('aria-disabled') === 'true') continue;
      if (el.closest('[inert]')) continue;
      if (el.closest('[aria-hidden="true"]')) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const s = window.getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none') continue;

      // The census taps the rounded centre: skip what a finger cannot reach there (off screen, such as a
      // chip whose centre sits on the bottom edge, or under other chrome).
      const cx = Math.round(rect.x + rect.width / 2);
      const cy = Math.round(rect.y + rect.height / 2);
      if (cx < 0 || cx >= window.innerWidth || cy < 0 || cy >= window.innerHeight) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !el.contains(hit)) continue;

      let curr: HTMLElement | null = el;
      let op = 1;
      while (curr) {
        const cs = window.getComputedStyle(curr);
        if (cs.visibility === 'hidden' || cs.display === 'none') {
          op = 0;
          break;
        }
        const o = parseFloat(cs.opacity);
        if (!isNaN(o)) op *= o;
        curr = curr.parentElement;
      }
      if (op < 0.05) continue;

      el.setAttribute('data-qa-census', String(count));
      const accessibleName =
        el.getAttribute('aria-label') ||
        el.innerText?.trim() ||
        el.getAttribute('title') ||
        el.tagName.toLowerCase();

      valid.push({ index: count, name: accessibleName });
      count++;
    }

    return valid;
  }, surface);

  let passed = 0;
  let total = 0;
  const failures: CensusFailure[] = [];

  for (const candidate of candidates) {
    const locator = page.locator(`[data-qa-census="${candidate.index}"]`);
    const box = await locator.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) continue;

    const cx = Math.round(box.x + box.width / 2);
    const cy = Math.round(box.y + box.height / 2);

    const readSample = () =>
      locator.evaluate((node) => {
        const parseScale = (transform: string, scaleProp?: string): number => {
          if (transform && transform !== 'none') {
            const m = transform.match(/^matrix\(([^)]+)\)$/);
            if (m) {
              const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
              if (parts.length >= 4) return Math.hypot(parts[0], parts[1]);
            }
            const m3d = transform.match(/^matrix3d\(([^)]+)\)$/);
            if (m3d) {
              const parts = m3d[1].split(',').map((x) => parseFloat(x.trim()));
              if (parts.length >= 3) return Math.hypot(parts[0], parts[1], parts[2]);
            }
          }
          if (scaleProp && scaleProp !== 'none') {
            const sc = parseFloat(scaleProp);
            if (!isNaN(sc)) return sc;
          }
          return 1;
        };

        const getStyle = (el: Element): StyleSample => {
          const s = window.getComputedStyle(el);
          const parsedOp = parseFloat(s.opacity);
          return {
            scale: parseScale(s.transform, s.scale),
            opacity: Number.isFinite(parsedOp) ? parsedOp : 1,
            backgroundColor: s.backgroundColor,
            filter: s.filter,
            color: s.color,
          };
        };

        return {
          el: getStyle(node),
          child: node.firstElementChild ? getStyle(node.firstElementChild) : null,
        };
      });

    const rest = await readSample();

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: cx, y: cy, id: 1 }],
    });

    await nextFrames(page, 2);

    const pressed = await readSample();

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });

    await page.waitForTimeout(300);

    const released = await readSample();

    total++;
    const result = evaluatePass(rest, pressed, released);
    if (result.passed) {
      passed++;
    } else {
      failures.push({
        name: candidate.name,
        surface,
        viewport: vpName,
        reason: result.reason,
      });
    }
  }

  await page.evaluate(() => {
    document
      .querySelectorAll('[data-qa-census]')
      .forEach((el) => el.removeAttribute('data-qa-census'));
  });

  return { passed, total, failures };
}

test('press census across all surfaces in touch contexts', async ({ browser }) => {
  const viewports = MATRIX.filter(
    (v) =>
      (v.width === 390 && v.height === 844 && v.hasTouch) ||
      (v.width === 844 && v.height === 390 && v.hasTouch),
  );

  let grandTotal = 0;
  let grandPassed = 0;
  const allFailures: CensusFailure[] = [];

  for (const vp of viewports) {
    const context = await newQaContext(browser, vp);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const surfacesWithElements = new Set<string>();

    try {
      await openFeed(page);

      // 1. Cover
      const coverRes = await runPressCensusOnSurface(page, cdp, 'cover', vp.name);
      if (coverRes.total >= 1) surfacesWithElements.add('cover');
      grandTotal += coverRes.total;
      grandPassed += coverRes.passed;
      allFailures.push(...coverRes.failures);

      // 2. Chrome (TopBar & Dock)
      const chromeRes = await runPressCensusOnSurface(page, cdp, 'chrome', vp.name);
      if (chromeRes.total >= 1) surfacesWithElements.add('chrome');
      grandTotal += chromeRes.total;
      grandPassed += chromeRes.passed;
      allFailures.push(...chromeRes.failures);

      // 3. LangMenu
      const langBtn = page.locator('header.topbar button.lang');
      await expect(langBtn, 'Opener button for surface "lang-menu" must be visible').toBeVisible();
      await langBtn.click();
      await page.waitForTimeout(250);
      const langRes = await runPressCensusOnSurface(page, cdp, 'lang-menu', vp.name);
      if (langRes.total >= 1) surfacesWithElements.add('lang-menu');
      grandTotal += langRes.total;
      grandPassed += langRes.passed;
      allFailures.push(...langRes.failures);
      await closeOpenOverlays(page);

      // 4. Explore overlay
      const exploreBtn = page.locator('header.topbar button.tb-ic:has(svg.lucide-compass)');
      await expect(exploreBtn, 'Opener button for surface "explore" must be visible').toBeVisible();
      await exploreBtn.click();
      await page.waitForTimeout(350);
      const expRes = await runPressCensusOnSurface(page, cdp, 'explore', vp.name);
      if (expRes.total >= 1) surfacesWithElements.add('explore');
      grandTotal += expRes.total;
      grandPassed += expRes.passed;
      allFailures.push(...expRes.failures);
      await closeOpenOverlays(page);

      // 5. Search overlay
      const searchBtn = page.locator('nav.bnav button.search');
      await expect(searchBtn, 'Opener button for surface "search" must be visible').toBeVisible();
      await searchBtn.click();
      await page.waitForTimeout(350);
      const searchRes = await runPressCensusOnSurface(page, cdp, 'search', vp.name);
      if (searchRes.total >= 1) surfacesWithElements.add('search');
      grandTotal += searchRes.total;
      grandPassed += searchRes.passed;
      allFailures.push(...searchRes.failures);
      await closeOpenOverlays(page);

      // 6. Messages overlay
      const chatBtn = page.locator('nav.bnav button.chat');
      await expect(chatBtn, 'Opener button for surface "messages" must be visible').toBeVisible();
      await chatBtn.click();
      await page.waitForTimeout(350);
      const chatRes = await runPressCensusOnSurface(page, cdp, 'messages', vp.name);
      if (chatRes.total >= 1) surfacesWithElements.add('messages');
      grandTotal += chatRes.total;
      grandPassed += chatRes.passed;
      allFailures.push(...chatRes.failures);
      await closeOpenOverlays(page);

      // 7. Notifications overlay
      const bellBtn = page.locator('header.topbar button.bell');
      await expect(bellBtn, 'Opener button for surface "notifications" must be visible').toBeVisible();
      await bellBtn.click();
      await page.waitForTimeout(350);
      const bellRes = await runPressCensusOnSurface(page, cdp, 'notifications', vp.name);
      if (bellRes.total >= 1) surfacesWithElements.add('notifications');
      grandTotal += bellRes.total;
      grandPassed += bellRes.passed;
      allFailures.push(...bellRes.failures);
      await closeOpenOverlays(page);

      // 8. Profile overlay
      const meBtn = page.locator('header.topbar button.me');
      await expect(meBtn, 'Opener button for surface "profile" must be visible').toBeVisible();
      await meBtn.click();
      await page.waitForTimeout(350);
      const profRes = await runPressCensusOnSurface(page, cdp, 'profile', vp.name);
      if (profRes.total >= 1) surfacesWithElements.add('profile');
      grandTotal += profRes.total;
      grandPassed += profRes.passed;
      allFailures.push(...profRes.failures);
      await closeOpenOverlays(page);

      // 9. Create overlay (or login sheet in demo mode)
      const plusBtn = page.locator('nav.bnav button.plus');
      await expect(plusBtn, 'Opener button for surface "create" must be visible').toBeVisible();
      await plusBtn.click();
      await page.waitForTimeout(350);
      const createRes = await runPressCensusOnSurface(page, cdp, 'create', vp.name);
      if (createRes.total >= 1) surfacesWithElements.add('create');
      grandTotal += createRes.total;
      grandPassed += createRes.passed;
      allFailures.push(...createRes.failures);
      await closeOpenOverlays(page);

      // 10. Details view
      await goToView(page, 'details');
      await page.waitForTimeout(400);
      const detailsRes = await runPressCensusOnSurface(page, cdp, 'details', vp.name);
      if (detailsRes.total >= 1) surfacesWithElements.add('details');
      grandTotal += detailsRes.total;
      grandPassed += detailsRes.passed;
      allFailures.push(...detailsRes.failures);

      // 11. Sources sheet (Details -> .srcline)
      const srcline = page.locator('.srcline').first();
      await expect(srcline, 'Opener button for surface "sources-sheet" must be visible').toBeVisible();
      await srcline.scrollIntoViewIfNeeded();
      await srcline.click();
      await page.waitForTimeout(350);
      const srcRes = await runPressCensusOnSurface(page, cdp, 'sources-sheet', vp.name);
      if (srcRes.total >= 1) surfacesWithElements.add('sources-sheet');
      grandTotal += srcRes.total;
      grandPassed += srcRes.passed;
      allFailures.push(...srcRes.failures);
      await closeOpenOverlays(page);

      // 12. Engage view
      await goToView(page, 'engage');
      await page.waitForTimeout(400);
      const engageRes = await runPressCensusOnSurface(page, cdp, 'engage', vp.name);
      if (engageRes.total >= 1) surfacesWithElements.add('engage');
      grandTotal += engageRes.total;
      grandPassed += engageRes.passed;
      allFailures.push(...engageRes.failures);

      const ALL_12_SURFACES = [
        'cover',
        'chrome',
        'lang-menu',
        'explore',
        'search',
        'messages',
        'notifications',
        'profile',
        'create',
        'details',
        'sources-sheet',
        'engage',
      ] as const;

      for (const surf of ALL_12_SURFACES) {
        expect(
          surfacesWithElements.has(surf),
          `Surface "${surf}" must yield >= 1 censused element at viewport ${vp.name} (${vp.width}x${vp.height})`,
        ).toBe(true);
      }
    } finally {
      await cdp.detach().catch(() => {});
      await context.close();
    }
  }

  expect(grandTotal).toBeGreaterThanOrEqual(50);

  const interaction_coverage_pct = grandTotal > 0 ? (grandPassed / grandTotal) * 100 : 0;
  const report: InteractionsJsonReport = {
    pct: interaction_coverage_pct,
    interaction_coverage_pct,
    total: grandTotal,
    passed: grandPassed,
    failures: allFailures,
  };

  writeInteractionsReport(report);

  expect(interaction_coverage_pct).toBe(100);
});

test('hover: fine pointer reveals hover feedback on interactive elements', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'desktop')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);
    await page.mouse.move(0, 0);

    const testedElements: Array<{
      name: string;
      diff: boolean;
      propDiffs: string[];
    }> = [];

    const surfaces = ['cover', 'details', 'explore'];

    for (const surface of surfaces) {
      if (surface === 'details') {
        await goToView(page, 'details');
        await page.waitForTimeout(300);
      } else if (surface === 'explore') {
        const exploreBtn = page.locator('header.topbar button.tb-ic:has(svg.lucide-compass)');
        if (await exploreBtn.isVisible()) {
          await exploreBtn.click();
          await page.waitForTimeout(350);
        }
      }

      const elements = page.locator(
        'button:visible, a[href]:visible, [role="button"]:visible, [role="tab"]:visible, input[type="checkbox"]:visible',
      );
      const count = await elements.count();

      for (let i = 0; i < count; i++) {
        const el = elements.nth(i);
        const box = await el.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) continue;

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        if (cx < 0 || cx > vp.width || cy < 0 || cy > vp.height) continue;

        // Move away first
        await page.mouse.move(0, 0);
        await page.waitForTimeout(50);

        const rest = await el.evaluate((node) => {
          const s = window.getComputedStyle(node);
          return {
            name:
              node.getAttribute('aria-label') ||
              node.textContent?.trim().slice(0, 20) ||
              node.tagName.toLowerCase(),
            backgroundColor: s.backgroundColor,
            color: s.color,
            transform: s.transform,
            opacity: s.opacity,
            filter: s.filter,
            boxShadow: s.boxShadow,
            borderColor: s.borderColor,
          };
        });

        await page.mouse.move(cx, cy);
        await page.waitForTimeout(200);

        const hover = await el.evaluate((node) => {
          const s = window.getComputedStyle(node);
          return {
            backgroundColor: s.backgroundColor,
            color: s.color,
            transform: s.transform,
            opacity: s.opacity,
            filter: s.filter,
            boxShadow: s.boxShadow,
            borderColor: s.borderColor,
          };
        });

        const propDiffs: string[] = [];
        if (hover.backgroundColor !== rest.backgroundColor) propDiffs.push('background-color');
        if (hover.color !== rest.color) propDiffs.push('color');
        if (hover.transform !== rest.transform) propDiffs.push('transform');
        if (hover.opacity !== rest.opacity) propDiffs.push('opacity');
        if (hover.filter !== rest.filter) propDiffs.push('filter');
        if (hover.boxShadow !== rest.boxShadow) propDiffs.push('box-shadow');
        if (hover.borderColor !== rest.borderColor) propDiffs.push('border-color');

        testedElements.push({
          name: rest.name,
          diff: propDiffs.length > 0,
          propDiffs,
        });

        if (testedElements.length >= 35) break;
      }

      if (testedElements.length >= 35) break;
    }

    expect(testedElements.length).toBeGreaterThanOrEqual(30);

    const failures = testedElements.filter((e) => !e.diff);
    expect(failures, `Elements without hover styles: ${failures.map((f) => f.name).join(', ')}`).toEqual([]);
  } finally {
    await context.close();
  }
});

test('no hover on touch: all :hover selectors are nested in (hover: hover) media queries', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);

    const badRules = await page.evaluate(() => {
      const violations: Array<{ selector: string; mediaCondition: string }> = [];

      function inspect(rule: CSSRule, mediaCondition: string): void {
        if (rule instanceof CSSMediaRule) {
          const condition = mediaCondition
            ? `${mediaCondition} and ${rule.conditionText}`
            : rule.conditionText;
          for (let i = 0; i < rule.cssRules.length; i++) {
            inspect(rule.cssRules[i], condition);
          }
        } else if (rule instanceof CSSGroupingRule) {
          for (let i = 0; i < rule.cssRules.length; i++) {
            inspect(rule.cssRules[i], mediaCondition);
          }
        } else if (rule instanceof CSSStyleRule) {
          if (rule.selectorText && rule.selectorText.includes(':hover')) {
            const hasHoverHover = /hover\s*:\s*hover/.test(mediaCondition);
            if (!hasHoverHover) {
              violations.push({
                selector: rule.selectorText,
                mediaCondition,
              });
            }
          }
        }
      }

      for (let s = 0; s < document.styleSheets.length; s++) {
        const sheet = document.styleSheets[s];
        try {
          const rules = sheet.cssRules;
          for (let r = 0; r < rules.length; r++) {
            inspect(rules[r], '');
          }
        } catch {
          // ignore CORS stylesheets
        }
      }

      return violations;
    });

    expect(badRules, `Found :hover rules outside @media (hover: hover): ${JSON.stringify(badRules)}`).toEqual([]);
  } finally {
    await context.close();
  }
});

test('focus: tab navigation reveals focus ring on active elements', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'desktop')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

    const tested = new Map<
      string,
      { pass: boolean; outlineStyle: string; outlineWidth: number; boxShadow: string }
    >();

    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(40);

      const elInfo = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) return null;

        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls =
          el.className && typeof el.className === 'string'
            ? `.${el.className.trim().split(/\s+/).join('.')}`
            : '';
        const aria = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20) || '';
        const rect = el.getBoundingClientRect();
        const key = `${tag}${id}${cls}[${aria}][${Math.round(rect.x)},${Math.round(rect.y)}]`;

        const s = window.getComputedStyle(el);
        const outlineStyle = s.outlineStyle;
        const outlineWidth = parseFloat(s.outlineWidth) || 0;
        const boxShadow = s.boxShadow;

        return { key, outlineStyle, outlineWidth, boxShadow };
      });

      if (!elInfo) continue;
      if (tested.has(elInfo.key)) continue;

      const hasOutline = elInfo.outlineStyle !== 'none' && elInfo.outlineWidth >= 2;
      const hasBoxShadow = elInfo.boxShadow !== 'none' && elInfo.boxShadow !== '';
      const pass = hasOutline || hasBoxShadow;

      tested.set(elInfo.key, {
        pass,
        outlineStyle: elInfo.outlineStyle,
        outlineWidth: elInfo.outlineWidth,
        boxShadow: elInfo.boxShadow,
      });
    }

    // 12, not 15: hidden views are inert since the a11y fix, so the Cover's real tab stops are about 14.
    expect(tested.size).toBeGreaterThanOrEqual(12);
    for (const [key, res] of tested.entries()) {
      expect(res.pass, `Element ${key} did not show focus ring or box-shadow`).toBe(true);
    }
  } finally {
    await context.close();
  }
});

test('like and save buttons are interruptible under rapid taps', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);

    const testButton = async (btnSelector: string, name: string): Promise<void> => {
      const btn = page.locator(btnSelector).first();
      await expect(btn).toBeVisible();

      const initialPressed = await btn.getAttribute('aria-pressed');
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;

      const cx = Math.round(box.x + box.width / 2);
      const cy = Math.round(box.y + box.height / 2);

      await page.evaluate((selector) => {
        const target = document.querySelector(selector);
        const svg = target?.querySelector('svg');
        const win = window as unknown as {
          __widths: number[];
          __running: boolean;
        };
        win.__widths = [];
        win.__running = true;

        function step() {
          if (!win.__running) return;
          if (svg) {
            win.__widths.push(svg.getBoundingClientRect().width);
          }
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }, btnSelector);

      const cdp = await context.newCDPSession(page);

      // Tap 1
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: cx, y: cy, id: 1 }],
      });
      await page.waitForTimeout(60);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await page.waitForTimeout(60);

      // Tap 2
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: cx, y: cy, id: 1 }],
      });
      await page.waitForTimeout(60);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });

      // Remainder of 700ms
      await page.waitForTimeout(460);

      const widths = await page.evaluate(() => {
        const win = window as unknown as {
          __widths: number[];
          __running: boolean;
        };
        win.__running = false;
        return win.__widths;
      });

      await cdp.detach().catch(() => {});

      expect(widths.length).toBeGreaterThan(15);
      for (let i = 1; i < widths.length; i++) {
        const diff = Math.abs(widths[i] - widths[i - 1]);
        expect(diff, `${name} frame ${i} jumped by ${diff}px (> 2px)`).toBeLessThanOrEqual(2);
      }

      const finalPressed = await btn.getAttribute('aria-pressed');
      expect(finalPressed, `${name} final aria-pressed did not return to initial`).toBe(initialPressed);
    };

    // Like button
    await testButton('.view.cover .rail .act.like button', 'Like');

    // Save button
    await testButton('.view.cover .rail .act.save button', 'Save');
  } finally {
    await context.close();
  }
});

test('count roll: like tap animates [data-count] descendant transforms', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);

    const likeBtn = page.locator('.view.cover .rail .act.like button').first();
    await expect(likeBtn).toBeVisible();

    const distinctTransforms = await page.evaluate(async () => {
      const container =
        document.querySelector('.view.cover .rail .act.like [data-count]') ||
        document.querySelector('.view.cover .rail .act.like');
      if (!container) return [];

      const descendants = Array.from(container.querySelectorAll('*'));
      if (descendants.length === 0) return [];

      const recorded = new Map<Element, Set<string>>();
      descendants.forEach((d) => recorded.set(d, new Set()));

      const btn = document.querySelector('.view.cover .rail .act.like button') as HTMLElement | null;
      btn?.click();

      const start = performance.now();
      return await new Promise<string[]>((resolve) => {
        function step(now: number) {
          for (const d of descendants) {
            const s = window.getComputedStyle(d);
            const t = s.transform;
            if (t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)') {
              recorded.get(d)?.add(t);
            }
          }
          if (now - start >= 400) {
            let maxCount: string[] = [];
            for (const set of recorded.values()) {
              if (set.size > maxCount.length) {
                maxCount = Array.from(set);
              }
            }
            resolve(maxCount);
          } else {
            requestAnimationFrame(step);
          }
        }
        requestAnimationFrame(step);
      });
    });

    expect(
      distinctTransforms.length,
      `Expected [data-count] descendant to have >= 2 distinct non-identity transforms, found ${distinctTransforms.length}`,
    ).toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
  }
});

test('indicator: category chip selection animates [data-indicator] rect x', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);

    const exploreBtn = page.locator('header.topbar button.tb-ic:has(svg.lucide-compass)');
    await exploreBtn.click();
    await page.waitForTimeout(400);

    const samples = await page.evaluate(async () => {
      const indicator = document.querySelector('.panel[aria-label="Explore"] [data-indicator], .chips [data-indicator]');
      const chips = document.querySelectorAll('.chips .chip');
      const chip4 = chips[3] as HTMLElement | undefined;

      if (!indicator || !chip4) {
        return [];
      }

      const xs: number[] = [];
      chip4.click();

      // The indicator is one shared layout element: it is re-rendered inside the newly selected chip and
      // animates from the old position, so it is looked up again on every frame.
      const start = performance.now();
      return await new Promise<number[]>((resolve) => {
        function step(now: number) {
          const current = document.querySelector('.chips [data-indicator]');
          if (current) xs.push(current.getBoundingClientRect().x);
          if (now - start >= 500) {
            resolve(xs);
          } else {
            requestAnimationFrame(step);
          }
        }
        requestAnimationFrame(step);
      });
    });

    expect(samples.length, 'Samples recorded on [data-indicator]').toBeGreaterThan(5);

    const startX = samples[0];
    const endX = samples[samples.length - 1];
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);

    const intermediate = samples.filter((x) => x > minX + 0.5 && x < maxX - 0.5);
    const distinctIntermediate = new Set(intermediate.map((x) => Math.round(x)));

    expect(
      distinctIntermediate.size,
      `Expected >= 3 distinct intermediate x values between ${minX} and ${maxX}`,
    ).toBeGreaterThanOrEqual(3);
  } finally {
    await context.close();
  }
});

test('popover: LangMenu grows from trigger within 150-250ms', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);

    const trigger = page.locator('header.topbar button.lang');
    await expect(trigger).toBeVisible();

    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    if (!triggerBox) return;

    const triggerCenter = {
      x: triggerBox.x + triggerBox.width / 2,
      y: triggerBox.y + triggerBox.height / 2,
    };

    interface FrameData {
      timestamp: number;
      opacity: number;
      scale: number;
      originX: number;
      originY: number;
    }

    const recorded = await page.evaluate(async () => {
      const btn = document.querySelector('header.topbar button.lang') as HTMLElement | null;
      const menu = document.querySelector('[role="menu"], .lmenu') as HTMLElement | null;
      if (!btn || !menu) return [];

      const activeMenu = menu;
      const frames: FrameData[] = [];
      const parseScale = (transform: string): number => {
        if (!transform || transform === 'none') return 1;
        const m = transform.match(/^matrix\(([^)]+)\)$/);
        if (m) {
          const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
          if (parts.length >= 4) return Math.hypot(parts[0], parts[1]);
        }
        return 1;
      };

      const start = performance.now();
      btn.click();

      return await new Promise<FrameData[]>((resolve) => {
        function step(now: number) {
          const s = window.getComputedStyle(activeMenu);
          const rect = activeMenu.getBoundingClientRect();
          const orig = s.transformOrigin.split(' ').map((x) => parseFloat(x));
          const originX = rect.x + (orig[0] || 0);
          const originY = rect.y + (orig[1] || 0);

          frames.push({
            timestamp: now,
            opacity: parseFloat(s.opacity) || 0,
            scale: parseScale(s.transform),
            originX,
            originY,
          });

          if (now - start >= 400) {
            resolve(frames);
          } else {
            requestAnimationFrame(step);
          }
        }
        requestAnimationFrame(step);
      });
    });

    expect(recorded.length).toBeGreaterThan(5);

    // Find first changed frame
    const firstChanged = recorded.find((f) => f.opacity > 0.05);
    expect(firstChanged, 'First changed frame found').toBeDefined();
    if (!firstChanged) return;

    expect(firstChanged.opacity, 'First changed frame opacity < 0.3').toBeLessThan(0.3);
    expect(firstChanged.scale, 'First changed frame scale < 1').toBeLessThan(1);

    // Find rest frame (opacity >= 0.99 and scale >= 0.99)
    const restFrame = recorded.find(
      (f) => f.timestamp >= firstChanged.timestamp && f.opacity >= 0.99 && Math.abs(f.scale - 1) <= 0.01,
    );
    expect(restFrame, 'Rest frame reached').toBeDefined();
    if (!restFrame) return;

    const reachDuration = restFrame.timestamp - firstChanged.timestamp;
    // Tolerance +-1 frame (18ms) around [150, 250]ms
    expect(reachDuration).toBeGreaterThanOrEqual(150 - 18);
    expect(reachDuration).toBeLessThanOrEqual(250 + 18);

    // Transform origin in page coordinates within 32px of trigger center
    const dist = Math.hypot(restFrame.originX - triggerCenter.x, restFrame.originY - triggerCenter.y);
    expect(dist, `Transform origin distance ${dist}px from trigger center (> 32px)`).toBeLessThanOrEqual(32);
  } finally {
    await context.close();
  }
});

test('modal sheet: sources sheet opens with scale and recedes .feed', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);
    await goToView(page, 'details');
    await page.waitForTimeout(300);

    const srcline = page.locator('.srcline').first();
    await srcline.scrollIntoViewIfNeeded();
    await expect(srcline).toBeVisible();

    interface SheetScaleSample {
      timestamp: number;
      sheetScale: number;
      feedScale: number;
    }

    const parseScale = (transform: string): number => {
      if (!transform || transform === 'none') return 1;
      const m = transform.match(/^matrix\(([^)]+)\)$/);
      if (m) {
        const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
        if (parts.length >= 4) return Math.hypot(parts[0], parts[1]);
      }
      return 1;
    };

    const openSamples = await page.evaluate(async () => {
      const btn = document.querySelector('.srcline') as HTMLElement | null;
      btn?.click();

      const parseScaleLocal = (transform: string): number => {
        if (!transform || transform === 'none') return 1;
        const m = transform.match(/^matrix\(([^)]+)\)$/);
        if (m) {
          const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
          if (parts.length >= 4) return Math.hypot(parts[0], parts[1]);
        }
        return 1;
      };

      const frames: SheetScaleSample[] = [];
      const start = performance.now();

      return await new Promise<SheetScaleSample[]>((resolve) => {
        function step(now: number) {
          const sheet = document.querySelector('.sheet:not([inert]), [role="dialog"]:not([inert])');
          const feed = document.querySelector('.feed');

          const sSheet = sheet ? window.getComputedStyle(sheet) : null;
          const sFeed = feed ? window.getComputedStyle(feed) : null;

          frames.push({
            timestamp: now,
            sheetScale: sSheet ? parseScaleLocal(sSheet.transform) : 1,
            feedScale: sFeed ? parseScaleLocal(sFeed.transform) : 1,
          });

          if (now - start >= 600) {
            resolve(frames);
          } else {
            requestAnimationFrame(step);
          }
        }
        requestAnimationFrame(step);
      });
    });

    expect(openSamples.length).toBeGreaterThan(10);

    // Early sheet scale < 1 and ends at 1
    const earlySheet = openSamples.slice(0, 5).some((f) => f.sheetScale < 1);
    const finalSheet = openSamples[openSamples.length - 1];
    expect(earlySheet, 'Early frame with sheet scale < 1').toBe(true);
    expect(Math.abs(finalSheet.sheetScale - 1), 'Sheet ends at scale 1').toBeLessThanOrEqual(0.02);

    // Once settled, .feed scale <= 0.97
    expect(finalSheet.feedScale, '.feed scale <= 0.97 once settled').toBeLessThanOrEqual(0.97);

    // Close with Escape
    await page.keyboard.press('Escape');

    await page.waitForTimeout(600);
    const settledFeedTransform = await page.locator('.feed').evaluate((el) => window.getComputedStyle(el).transform);
    const returnScale = parseScale(settledFeedTransform);
    expect(Math.abs(returnScale - 1), '.feed returns to scale 1 within 600ms').toBeLessThanOrEqual(0.02);
  } finally {
    await context.close();
  }
});

test('toast: offline toast enters with translateY and dismisses on swipe down', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);

    await page.evaluate(() => {
      const win = window as unknown as {
        __toastY: number[];
        __toastRun: boolean;
      };
      win.__toastY = [];
      win.__toastRun = true;

      function step() {
        if (!win.__toastRun) return;
        const toast = document.querySelector('[role="status"]');
        if (toast) {
          const s = window.getComputedStyle(toast);
          const t = s.transform;
          let ty = 0;
          if (t && t !== 'none') {
            const m = t.match(/^matrix\(([^)]+)\)$/);
            if (m) {
              const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
              if (parts.length >= 6) ty = parts[5];
            }
          }
          win.__toastY.push(ty);
        }
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });

    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });

    await page.waitForTimeout(600);

    const translateYs = await page.evaluate(() => {
      const win = window as unknown as {
        __toastY: number[];
        __toastRun: boolean;
      };
      win.__toastRun = false;
      return win.__toastY;
    });

    expect(translateYs.length).toBeGreaterThan(5);
    const firstY = translateYs[0];
    expect(firstY, 'First visible frame translateY > 0').toBeGreaterThan(0);
    const lastY = translateYs[translateYs.length - 1];
    expect(Math.abs(lastY), 'Ends at translateY 0').toBeLessThanOrEqual(0.5);

    const intermediate = translateYs.filter((y) => y > 0.5 && y < firstY - 0.5);
    const distinct = new Set(intermediate.map((y) => Math.round(y)));
    expect(distinct.size, '>= 3 intermediate translateY values').toBeGreaterThanOrEqual(3);

    // Swipe down 80px
    const toast = page.locator('[role="status"]');
    const box = await toast.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const cx = Math.round(box.x + box.width / 2);
    const startY = Math.round(box.y + box.height / 2);
    const cdp = await context.newCDPSession(page);

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: cx, y: startY, id: 1 }],
    });
    for (let step = 1; step <= 8; step++) {
      const curY = Math.round(startY + (80 * step) / 8);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: cx, y: curY, id: 1 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });

    await page.waitForTimeout(400);

    const isGone = await page.evaluate(() => {
      const el = document.querySelector('[role="status"]');
      if (!el) return true;
      const s = window.getComputedStyle(el);
      const op = parseFloat(s.opacity);
      if (op < 0.05) return true;
      const rect = el.getBoundingClientRect();
      if (rect.y >= window.innerHeight) return true;
      return false;
    });

    expect(isGone, 'Toast is gone within 400ms of swipe down').toBe(true);
    await cdp.detach().catch(() => {});
  } finally {
    await context.close();
  }
});

test('comment: newly posted comment animates into list', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);
    await goToView(page, 'engage');
    await page.waitForTimeout(400);

    const composer = page.locator('.cform input[name="comment"]').first();
    const sendBtn = page.locator('.cform button.csend').first();

    // Sign in through the UI in local demo mode:
    // Press Send (or focus input), the login sheet opens
    await composer.fill('A thoughtful comment on this article');
    await sendBtn.click();

    const gbtn = page.locator('button.gbtn');
    await expect(gbtn, 'Login sheet Google button must appear').toBeVisible();
    await gbtn.click();
    await expect(gbtn, 'Login sheet should close after signing in').not.toBeVisible();
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      const win = window as unknown as {
        __commentSample?: {
          firstOpacity: number;
          firstTransform: string;
          reachedRestMs: number;
        };
      };

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (let i = 0; i < m.addedNodes.length; i++) {
            const node = m.addedNodes[i];
            if (
              node instanceof HTMLElement &&
              (node.matches('.comment, .citem, [data-comment]') ||
                node.querySelector?.('.citem, .comment'))
            ) {
              const target = node.matches('.comment, .citem, [data-comment]')
                ? node
                : (node.querySelector('.citem, .comment') as HTMLElement);
              const t0 = performance.now();
              const s0 = window.getComputedStyle(target);
              const firstOpacity = parseFloat(s0.opacity);
              const firstTransform = s0.transform;

              function check(now: number) {
                const s = window.getComputedStyle(target);
                const op = parseFloat(s.opacity);
                const t = s.transform;
                const isRest = op >= 0.98 && (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)');
                if (isRest) {
                  win.__commentSample = {
                    firstOpacity,
                    firstTransform,
                    reachedRestMs: now - t0,
                  };
                  observer.disconnect();
                } else if (now - t0 < 800) {
                  requestAnimationFrame(check);
                } else {
                  win.__commentSample = {
                    firstOpacity,
                    firstTransform,
                    reachedRestMs: now - t0,
                  };
                  observer.disconnect();
                }
              }
              requestAnimationFrame(check);
              return;
            }
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });

    await composer.fill('A thoughtful comment on this article');
    await sendBtn.click();

    await page.waitForTimeout(700);

    const sample = await page.evaluate(() => {
      return (
        window as unknown as {
          __commentSample?: {
            firstOpacity: number;
            firstTransform: string;
            reachedRestMs: number;
          };
        }
      ).__commentSample;
    });

    expect(sample, 'New comment element was inserted and recorded').toBeDefined();
    if (sample) {
      const isInitialAnim =
        sample.firstOpacity < 0.5 ||
        (sample.firstTransform !== 'none' &&
          sample.firstTransform !== 'matrix(1, 0, 0, 1, 0, 0)');
      expect(isInitialAnim, 'Comment first frame has opacity < 0.5 or non-identity transform').toBe(
        true,
      );
      expect(sample.reachedRestMs, 'Comment reaches rest within 600ms').toBeLessThanOrEqual(600);
    }
  } finally {
    await context.close();
  }
});

test('checklist: apply step checkbox tick stroke-dashoffset draws to 0', async ({ browser }) => {
  const vp = MATRIX.find((v) => v.name === 'iphone-portrait')!;
  const context = await newQaContext(browser, vp);
  const page = await context.newPage();
  try {
    await openFeed(page);
    await goToView(page, 'engage');
    await page.waitForTimeout(400);

    const step = page.locator('.apply .step').first();
    await expect(step).toBeVisible();

    await page.evaluate(() => {
      const win = window as unknown as {
        __offsets: number[];
        __running: boolean;
      };
      win.__offsets = [];
      win.__running = true;

      const pathEl = document.querySelector('.apply .step .chk svg path');
      function poll() {
        if (!win.__running) return;
        if (pathEl) {
          const s = window.getComputedStyle(pathEl);
          const v = parseFloat(s.strokeDashoffset);
          if (!isNaN(v)) {
            win.__offsets.push(v);
          }
        }
        requestAnimationFrame(poll);
      }
      requestAnimationFrame(poll);
    });

    await step.click();
    await page.waitForTimeout(500);

    const offsets = await page.evaluate(() => {
      const win = window as unknown as {
        __offsets: number[];
        __running: boolean;
      };
      win.__running = false;
      return win.__offsets;
    });

    expect(offsets.length, 'Offsets sampled on tick SVG path').toBeGreaterThan(3);

    const initialOffset = offsets[0];
    const finalOffset = offsets[offsets.length - 1];

    expect(Math.abs(finalOffset), 'Tick stroke-dashoffset ends at 0').toBeLessThanOrEqual(0.5);

    const intermediate = offsets.filter((val) => val > 0.5 && val < initialOffset - 0.5);
    const distinct = new Set(intermediate.map((v) => Math.round(v * 10) / 10));

    expect(
      distinct.size,
      `Expected >= 2 intermediate stroke-dashoffset values, found ${distinct.size}`,
    ).toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
  }
});
