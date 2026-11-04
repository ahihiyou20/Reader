// Frame-budget probe on the real Windows GPU (run by tests/qa/edge-perf.mjs with Windows node): installed Edge, driven by
// the global Playwright in WSL, measures rAF interval p95 and long tasks for the gesture flows and the rotation.
const { chromium } =
  await import('file://wsl.localhost/Ubuntu/home/aduc/.nvm/versions/node/v22.23.4/lib/node_modules/playwright/node_modules/playwright-core/index.mjs');
const URL = process.argv[2] || 'http://localhost:4174/';
const start = (p) =>
  p.evaluate(() => {
    const w = window;
    const id = (w.__run = (w.__run || 0) + 1);
    w.__iv = [];
    w.__lt = [];
    let last = performance.now();
    const loop = (t) => {
      if (w.__run !== id || w.__stopped === id) return;
      w.__iv.push(t - last);
      last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    w.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration)));
    w.__po.observe({ type: 'longtask' });
  });
const stop = (p) =>
  p.evaluate(() => {
    const w = window;
    w.__stopped = w.__run;
    w.__po.disconnect();
    const iv = w.__iv.slice(1).sort((a, b) => a - b);
    return {
      p95: iv.length ? +iv[Math.floor(iv.length * 0.95)].toFixed(1) : null,
      n: iv.length,
      lt: w.__lt.length ? Math.round(Math.max(...w.__lt)) : 0,
    };
  });
async function flow(page, name, action, ms = 900) {
  const runs = [];
  for (let r = 0; r < 3; r++) {
    await start(page);
    await action(page, r);
    await page.waitForTimeout(ms);
    runs.push(await stop(page));
  }
  const p95s = runs.map((x) => x.p95).sort((a, b) => a - b);
  return { name, p95: p95s[1], maxLongTask: Math.max(...runs.map((x) => x.lt)), runs };
}

const b = await chromium.launch({ channel: 'msedge', headless: false });
const out = [];
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForSelector('section.article[data-active="true"]');
  await p.waitForTimeout(2500);
  out.push(
    await p.evaluate(() => ({
      gpu: (() => {
        const c = document.createElement('canvas').getContext('webgl');
        const d = c && c.getExtension('WEBGL_debug_renderer_info');
        return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })(),
    })),
  );
  await p.mouse.move(720, 450);
  out.push(
    await flow(p, 'desktop feed swipe (wheel)', async (pg) => {
      await pg.mouse.wheel(0, 300);
    }),
  );
  out.push(
    await flow(p, 'desktop view swipe (wheel)', async (pg, r) => {
      await pg.mouse.wheel(r % 2 ? -300 : 300, 0);
    }),
  );
  await ctx.close();
}
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForSelector('section.article[data-active="true"]');
  await p.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(p);
  const drag = async (x0, y0, x1, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8 }],
      });
      await p.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  out.push(
    await flow(p, 'phone view swipe (touch)', async (pg, r) => {
      if (r % 2) await drag(80, 500, 330, 500);
      else await drag(330, 500, 80, 500);
    }),
  );
  out.push(
    await flow(p, 'phone feed swipe (touch)', async () => {
      await drag(195, 600, 195, 250);
    }),
  );
  out.push(
    await flow(
      p,
      'rotation 390x844 <-> 844x390',
      async (pg, r) => {
        await pg.setViewportSize(r % 2 ? { width: 390, height: 844 } : { width: 844, height: 390 });
      },
      1500,
    ),
  );
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(out, null, 1));
