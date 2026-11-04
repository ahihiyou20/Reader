import { expect, test, type Page } from '@playwright/test';
import { goToView, newQaContext, openFeed } from '../qa/app';
import {
  getTweenedProperties,
  startSampling,
  stopSampling,
  type QaAnimationRecord,
  type SamplingResult,
} from '../qa/motion-sampler';

const ALLOWED_PROPERTIES = new Set([
  'transform',
  'translate',
  'scale',
  'rotate',
  'opacity',
  'filter',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'webkitbackdropfilter',
  'backdropfilter',
  'clip-path',
  'clippath',
  'background-color',
  'backgroundcolor',
  'color',
  'stroke-dashoffset',
  'strokedashoffset',
  'visibility',
]);

function normalizeProp(prop: string): string {
  return prop.trim().toLowerCase();
}

function checkEasing(easing: string, target: string, violations: string[]): void {
  if (!easing) return;

  // Fail on the keyword ease-in (exact match or word in timing.easing/keyframeEasings)
  // Negative lookahead prevents matching ease-in-out
  if (/(?:^|[,\s])ease-in(?![-\w])/i.test(easing)) {
    violations.push(`Disallowed easing 'ease-in' on target "${target}": easing is "${easing}"`);
  }

  // Fail on cubic-bezier(x1, y1, x2, y2) with x1 >= 0.3, y1 <= 0.1, x2 >= 0.9, y2 >= 0.9
  const cbRegex = /cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = cbRegex.exec(easing)) !== null) {
    const x1 = parseFloat(match[1]);
    const y1 = parseFloat(match[2]);
    const x2 = parseFloat(match[3]);
    const y2 = parseFloat(match[4]);
    if (x1 >= 0.3 && y1 <= 0.1 && x2 >= 0.9 && y2 >= 0.9) {
      violations.push(
        `Disallowed cubic-bezier curve (${x1}, ${y1}, ${x2}, ${y2}) on target "${target}": easing is "${easing}"`,
      );
    }
  }
}

function checkDuration(anim: QaAnimationRecord): string | null {
  const isInfinite =
    anim.iterations === Infinity ||
    anim.iterations === 'Infinity' ||
    (typeof anim.iterations === 'number' && !Number.isFinite(anim.iterations));

  const classes = anim.classes ?? [];
  const dataAttrs = anim.dataAttrs ?? [];

  const isSkeleton =
    dataAttrs.includes('data-skeleton') ||
    dataAttrs.includes('data-skel-block');

  if (isInfinite) {
    if (!isSkeleton) {
      return `Disallowed infinite animation on target "${anim.target}" (pseudo: "${anim.pseudoElement}")`;
    }
    return null;
  }

  const dur = typeof anim.duration === 'number' ? anim.duration : parseFloat(String(anim.duration));
  if (isNaN(dur) || dur <= 0) return null;

  let maxAllowed = 500;
  if (anim.pseudoElement.startsWith('::view-transition')) {
    maxAllowed = Math.max(maxAllowed, 600);
  }
  if (dataAttrs.includes('data-sweep')) {
    maxAllowed = Math.max(maxAllowed, 700);
  }
  if (classes.includes('hint') && classes.includes('nudge')) {
    maxAllowed = Math.max(maxAllowed, 900);
  }
  if (classes.includes('flash')) {
    maxAllowed = Math.max(maxAllowed, 1200);
  }
  if (classes.includes('confetti')) {
    maxAllowed = Math.max(maxAllowed, 1600);
  }

  if (dur > maxAllowed) {
    return `Animation duration ${dur}ms exceeds allowed limit of ${maxAllowed}ms on target "${anim.target}" (pseudo: "${anim.pseudoElement}")`;
  }
  return null;
}

function verifyMotionQuality(result: SamplingResult): void {
  const violations: string[] = [];

  // 1. Allowed animated properties on animations
  for (const anim of result.animations) {
    // The browser's own View Transition image-pair animation sets mix-blend-mode: plus-lighter on the
    // old/new snapshots; it is compositor work, not app motion, so it is allowed on those pseudos only.
    const isVtImagePair = /^::view-transition-(old|new)\(/.test(anim.pseudoElement);
    for (const prop of anim.properties) {
      const norm = normalizeProp(prop);
      if (!ALLOWED_PROPERTIES.has(norm) && !(isVtImagePair && norm === 'mixblendmode')) {
        violations.push(
          `Disallowed animated property "${prop}" on target "${anim.target}" (pseudo: "${anim.pseudoElement}")`,
        );
      }
    }

    // 2. Easing checks
    checkEasing(anim.easing, anim.target, violations);
    for (const kfEasing of anim.keyframeEasings) {
      checkEasing(kfEasing, anim.target, violations);
    }

    // 3. Durations (finite) & infinite check
    const durViolation = checkDuration(anim);
    if (durViolation) {
      violations.push(durViolation);
    }
  }

  // Allowed animated properties on tweened style properties
  // view-transition-name is a discrete identifier that moves to the active article; it is never
  // interpolated, so its changes are not motion.
  const tweened = getTweenedProperties(result).filter((t) => t.property !== 'view-transition-name');
  for (const t of tweened) {
    if (t.property.startsWith('--')) {
      violations.push(
        `Disallowed tweened custom property "${t.property}" on element "${t.element}" (${t.changeCount} changes)`,
      );
    } else {
      const norm = normalizeProp(t.property);
      if (!ALLOWED_PROPERTIES.has(norm)) {
        violations.push(
          `Disallowed tweened property "${t.property}" on element "${t.element}" (${t.changeCount} changes)`,
        );
      }
    }
  }

  // 4. Minimum activity
  const distinct = new Set<string>();
  for (const a of result.animations) {
    distinct.add(
      `anim::${a.target}::${a.pseudoElement}::${a.properties.slice().sort().join(',')}`,
    );
  }
  for (const t of tweened) {
    distinct.add(`tween::${t.element}::${t.property}`);
  }

  expect(distinct.size, `Recorded distinct animated/tweened properties count`).toBeGreaterThanOrEqual(25);
  expect(violations, violations.join('\n')).toEqual([]);
}

async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 8,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: point(from.x, from.y),
  });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(x, y),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('TESTSPEC §9 / ACCEPTANCE 25: Motion Quality', () => {
  test('motion quality in 390x844 touch context', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    await openFeed(page);
    await startSampling(page);

    // 1. feed swipe up and down (touch drag)
    await touchDrag(page, { x: 195, y: 620 }, { x: 195, y: 220 });
    await page.waitForTimeout(400);
    await touchDrag(page, { x: 195, y: 220 }, { x: 195, y: 620 });
    await page.waitForTimeout(400);

    // 2. view swipe to Details and back
    await touchDrag(page, { x: 310, y: 420 }, { x: 50, y: 420 });
    await page.waitForTimeout(400);
    await touchDrag(page, { x: 50, y: 420 }, { x: 310, y: 420 });
    await page.waitForTimeout(400);

    // 3. open and close Explore, Search, Profile, Messages, Notifications
    const exploreBtn = page.locator('.topbar button.tb-ic:has(svg.lucide-compass), .crow .gridbtn').first();
    if (await exploreBtn.count() > 0) {
      await exploreBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    const searchBtn = page.locator('.bnav .search').first();
    if (await searchBtn.count() > 0) {
      await searchBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    const profileBtn = page.locator('.topbar .me').first();
    if (await profileBtn.count() > 0) {
      await profileBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    const messagesBtn = page.locator('.bnav .chat').first();
    if (await messagesBtn.count() > 0) {
      await messagesBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    const notificationsBtn = page.locator('.topbar .bell').first();
    if (await notificationsBtn.count() > 0) {
      await notificationsBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    // 4. LangMenu open/close
    const langBtn = page.locator('.topbar .lang').first();
    if (await langBtn.count() > 0) {
      await langBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    // 5. like and save toggles
    const likeBtn = page.locator('.rail button').first();
    if (await likeBtn.count() > 0) {
      await likeBtn.click();
      await page.waitForTimeout(150);
      await likeBtn.click();
      await page.waitForTimeout(150);
    }

    const saveBtn = page.locator('.rail button').nth(1);
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(150);
      await saveBtn.click();
      await page.waitForTimeout(150);
    }

    // 6. offline toast
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(300);

    // 7. Sources sheet open (click .srcline) and drag-to-close (or Escape)
    await goToView(page, 'details');
    await page.waitForTimeout(200);
    const srcline = page.locator('.srcline').first();
    if (await srcline.count() > 0) {
      await srcline.scrollIntoViewIfNeeded();
      await srcline.click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // 8. Details scroll through 3 blocks
    await page.evaluate(() => {
      const el = document.querySelector('.dscroll');
      if (el) el.scrollTop = 500;
    });
    await page.waitForTimeout(300);

    // 9. checklist tick (tap checkbox in Apply)
    await goToView(page, 'engage');
    await page.waitForTimeout(200);
    const chk = page.locator('.apply .step, .apply input[type="checkbox"]').first();
    if (await chk.count() > 0) {
      await chk.click();
      await page.waitForTimeout(300);
    }

    // 10. rotation 390×844 → 844×390 → 390×844 (in touch context)
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    const result = await stopSampling(page);
    verifyMotionQuality(result);
    await context.close();
  });

  test('motion quality in 1440x900 desktop mouse context', async ({ browser }) => {
    const context = await newQaContext(browser, {
      width: 1440,
      height: 900,
      isMobile: false,
      hasTouch: false,
    });
    const page = await context.newPage();

    await openFeed(page);
    await startSampling(page);

    // 1. feed swipe up and down (ArrowDown / ArrowUp)
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);

    // 2. view swipe to Details and back (ArrowRight / ArrowLeft)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(400);

    // 3. open and close Explore, Search, Profile, Messages, Notifications
    const exploreBtn = page.locator('.topbar button.tb-ic:has(svg.lucide-compass), .crow .gridbtn').first();
    if (await exploreBtn.count() > 0) {
      await exploreBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    const searchBtn = page.locator('.bnav .search').first();
    if (await searchBtn.count() > 0) {
      await searchBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    const profileBtn = page.locator('.topbar .me').first();
    if (await profileBtn.count() > 0) {
      await profileBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    const messagesBtn = page.locator('.bnav .chat').first();
    if (await messagesBtn.count() > 0) {
      await messagesBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    const notificationsBtn = page.locator('.topbar .bell').first();
    if (await notificationsBtn.count() > 0) {
      await notificationsBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    // 4. LangMenu open/close
    const langBtn = page.locator('.topbar .lang').first();
    if (await langBtn.count() > 0) {
      await langBtn.click();
      await page.waitForTimeout(250);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }

    // 5. like and save toggles
    const likeBtn = page.locator('.rail button').first();
    if (await likeBtn.count() > 0) {
      await likeBtn.click();
      await page.waitForTimeout(150);
      await likeBtn.click();
      await page.waitForTimeout(150);
    }

    const saveBtn = page.locator('.rail button').nth(1);
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(150);
      await saveBtn.click();
      await page.waitForTimeout(150);
    }

    // 6. offline toast
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(300);

    // 7. Sources sheet open (click .srcline) and close
    await goToView(page, 'details');
    await page.waitForTimeout(200);
    const srcline = page.locator('.srcline').first();
    if (await srcline.count() > 0) {
      await srcline.scrollIntoViewIfNeeded();
      await srcline.click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // 8. Details scroll through 3 blocks
    await page.evaluate(() => {
      const el = document.querySelector('.dscroll');
      if (el) el.scrollTop = 500;
    });
    await page.waitForTimeout(300);

    // 9. checklist tick (tap checkbox in Apply)
    await goToView(page, 'engage');
    await page.waitForTimeout(200);
    const chk = page.locator('.apply .step, .apply input[type="checkbox"]').first();
    if (await chk.count() > 0) {
      await chk.click();
      await page.waitForTimeout(300);
    }

    const result = await stopSampling(page);
    verifyMotionQuality(result);
    await context.close();
  });
});
