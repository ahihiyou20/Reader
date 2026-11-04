// Swipe smoothness in WebKit (the engine behind Safari). Run with Windows node:
//   node webkit-swipe-probe.mjs <url>
// Drags the feed up by 40% with the mouse (the feed uses pointer events), releases, and records the
// track position on every frame until it settles. Prints JSON: the largest frame gap after release,
// how many distinct positions the settle showed, and the same for a horizontal view swipe.
const { webkit } = await import('file://wsl.localhost/Ubuntu/home/aduc/.nvm/versions/node/v22.23.4/lib/node_modules/playwright/node_modules/playwright-core/index.mjs');
const url = process.argv[2];
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForSelector('section.article[data-active="true"]');
await page.waitForTimeout(3000);

const record = (selector, axis) =>
  page.evaluate(
    ({ selector, axis }) =>
      new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const step = (t) => {
          const el = document.querySelector(selector);
          const m = el ? new DOMMatrix(getComputedStyle(el).transform) : null;
          out.push({ t: t - t0, v: m ? Math.round(axis === 'y' ? m.m42 : m.m41) : null });
          if (t - t0 < 1600) requestAnimationFrame(step);
          else resolve(out);
        };
        requestAnimationFrame(step);
      }),
    { selector, axis },
  );

async function swipe(axis, selector) {
  const from = { x: 200, y: 600 };
  const to = axis === 'y' ? { x: 200, y: 600 - 844 * 0.4 } : { x: 200 - 390 * 0.45, y: 600 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  const rec = record(selector, axis);
  await page.mouse.up();
  const frames = await rec;
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t);
  const values = frames.map((f) => f.v);
  const end = values[values.length - 1];
  const settleFrames = values.findIndex((v) => v === end);
  return {
    maxGapMs: Math.round(Math.max(...gaps)),
    p95GapMs: Math.round(gaps.sort((a, b) => a - b)[Math.floor(gaps.length * 0.95)]),
    distinctPositions: new Set(values).size,
    framesToSettle: settleFrames,
    start: values[0],
    end,
    frames: process.env.FRAMES ? frames.map((f) => `${Math.round(f.t)}:${f.v}`).join(' ') : undefined,
  };
}

const feed = await swipe('y', '.track');
await page.waitForTimeout(1500);
const view = await swipe('x', 'section.article[data-active="true"] .views');
console.log(JSON.stringify({ url, feed, view, errors }));
await browser.close();
