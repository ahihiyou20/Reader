// Frame-by-frame continuity checks (round 2, ACCEPTANCE D12–D17). The older QA specs check where
// things end up and how long frames take; these check every frame in between: a page that teleports,
// a settle that wobbles back and forth, a frame where the screen is not covered by the article the
// reader is on, a flash in the pixels, or layout shift during a gesture.
import type { CDPSession, Page } from '@playwright/test';
import sharp from 'sharp';

export interface Frame {
  t: number;
  w: number;
  h: number;
  active: string | null;
  /** Top edge of every mounted article, by slug. */
  tops: Record<string, number>;
  /** Left edge of the active article's cover view (moves on horizontal swipes). */
  coverLeft: number | null;
  /** Share of the viewport height covered by articles. */
  coverage: number;
}

export interface Violation {
  kind: 'jump' | 'reversal' | 'gap' | 'wrong-article' | 'layout-shift' | 'flash';
  t: number;
  detail: string;
}

type ContinuityWindow = typeof window & {
  __cont?: { frames: Frame[]; shift: number; stop: () => void };
};

/** Starts recording one sample per animation frame, plus layout-shift entries. */
export async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as ContinuityWindow;
    win.__cont?.stop();
    const state = { frames: [] as Frame[], shift: 0, stop: () => {} };
    let running = true;
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as Array<PerformanceEntry & { value: number }>) state.shift += e.value;
    });
    try {
      po.observe({ type: 'layout-shift', buffered: false });
    } catch {}
    const step = (t: number) => {
      if (!running) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const tops: Record<string, number> = {};
      const spans: Array<[number, number]> = [];
      for (const a of document.querySelectorAll<HTMLElement>('section.article')) {
        const r = a.getBoundingClientRect();
        const slug = a.dataset.slug ?? '?';
        tops[slug] = r.top;
        const lo = Math.max(0, r.top);
        const hi = Math.min(h, r.bottom);
        if (hi > lo && getComputedStyle(a).visibility !== 'hidden') spans.push([lo, hi]);
      }
      spans.sort((x, y) => x[0] - y[0]);
      let covered = 0;
      let end = 0;
      for (const [lo, hi] of spans) {
        if (hi <= end) continue;
        covered += hi - Math.max(lo, end);
        end = hi;
      }
      const act = document.querySelector<HTMLElement>('section.article[data-active="true"]');
      const cover = act?.querySelector('.view.cover')?.getBoundingClientRect();
      state.frames.push({
        t,
        w,
        h,
        active: act?.dataset.slug ?? null,
        tops,
        coverLeft: cover ? cover.left : null,
        coverage: covered / h,
      });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    state.stop = () => {
      running = false;
      po.disconnect();
    };
    win.__cont = state;
  });
}

export async function stopRecording(page: Page): Promise<{ frames: Frame[]; shift: number }> {
  return page.evaluate(() => {
    const win = window as ContinuityWindow;
    const s = win.__cont;
    s?.stop();
    return { frames: s?.frames ?? [], shift: s?.shift ?? 0 };
  });
}

export interface AnalyzeOptions {
  /** Check per-frame steps for teleports (off for keyboard navigation, which is instant by design). */
  jumps?: boolean;
  /**
   * [touch start, release] per gesture, in performance.now() time. While a finger is down the page
   * follows it, and Chrome batches several moves into one frame, so jumps are only checked while
   * the app moves things on its own. Reversals are counted after the last release.
   */
  touches?: Array<[number, number]>;
  /** Slug the reader must end on (and never see another article on screen before it, if `steady`). */
  expectSlug?: string;
  /** The active article must not change at any frame (rotation, horizontal swipes). */
  steady?: boolean;
  /**
   * Viewport resizes (rotation). The first frame after each may still have the old size, and layout
   * shift is not counted: a rotation reflows everything by definition. Coverage and the active
   * article are what a rotation must keep.
   */
  resizeAt?: number[];
}

const JUMP_FLOOR = 48;

/** A step is a jump when it is large and at least 3× both neighbouring steps. */
function jumpsIn(
  series: Array<{ t: number; v: number }>,
  label: string,
  touching: (t0: number, t1: number) => boolean,
  out: Violation[],
) {
  const d = series.slice(1).map((s, i) => ({ t0: series[i].t, t: s.t, d: Math.abs(s.v - series[i].v) }));
  for (let i = 0; i < d.length; i++) {
    // The spring starts on the frame after the release, so the first step after a touch is short
    // and the next one carries the finger's speed; on a 15 fps (4× CPU) run that looks like a jump
    // against its neighbour. Skip the step that follows a touch-driven one.
    if (touching(d[i].t0, d[i].t) || (i > 0 && touching(d[i - 1].t0, d[i - 1].t))) continue;
    const prev = d[i - 1]?.d ?? 0;
    const next = d[i + 1]?.d ?? 0;
    if (d[i].d > JUMP_FLOOR && d[i].d > 3 * Math.max(prev, next)) {
      const dt = d[i].t - d[i].t0;
      out.push({
        kind: 'jump',
        t: d[i].t,
        detail: `${label} moved ${d[i].d.toFixed(0)}px in one ${dt.toFixed(0)} ms frame (neighbours ${prev.toFixed(0)}, ${next.toFixed(0)}px)`,
      });
    }
  }
}

function reversalsIn(series: Array<{ t: number; v: number }>, label: string, out: Violation[]) {
  let sign = 0;
  let flips = 0;
  for (let i = 1; i < series.length; i++) {
    const d = series[i].v - series[i - 1].v;
    if (Math.abs(d) < 0.5) continue;
    const s = Math.sign(d);
    if (sign && s !== sign) flips++;
    sign = s;
  }
  // One overshoot of the spring is allowed.
  if (flips > 1) out.push({ kind: 'reversal', t: series.at(-1)?.t ?? 0, detail: `${label} changed direction ${flips} times while settling` });
}

export function analyze(rec: { frames: Frame[]; shift: number }, o: AnalyzeOptions = {}): Violation[] {
  const out: Violation[] = [];
  const skip = new Set<number>();
  for (const at of o.resizeAt ?? []) {
    const i = rec.frames.findIndex((f) => f.t >= at);
    if (i >= 0) skip.add(i);
  }
  const frames = rec.frames.filter((_, i) => !skip.has(i));
  const first = frames[0];
  if (!first) return [{ kind: 'gap', t: 0, detail: 'no frames recorded' }];

  for (const f of frames) {
    if (f.coverage < 0.99) out.push({ kind: 'gap', t: f.t, detail: `only ${(f.coverage * 100).toFixed(1)}% of the screen covered by articles` });
    if (o.steady && f.active !== first.active) out.push({ kind: 'wrong-article', t: f.t, detail: `active ${f.active}, expected ${first.active}` });
  }
  const last = frames.at(-1)!;
  if (o.expectSlug && last.active !== o.expectSlug) out.push({ kind: 'wrong-article', t: last.t, detail: `ended on ${last.active}, expected ${o.expectSlug}` });

  // Track the article the reader ends on, through every frame it is mounted in, at a stable size.
  const slug = o.expectSlug ?? last.active;
  if (slug) {
    const sized = (f: Frame) => f.w === last.w && f.h === last.h && slug in f.tops;
    const vert = frames.filter(sized).map((f) => ({ t: f.t, v: f.tops[slug] }));
    const horiz = frames.filter((f) => sized(f) && f.active === slug && f.coverLeft !== null).map((f) => ({ t: f.t, v: f.coverLeft! }));
    // A step whose frame interval overlaps a touch (plus one frame after the release, which still
    // shows the finger's last moves) is driven by the finger.
    const touching = (t0: number, t1: number) => (o.touches ?? []).some(([a, b]) => t1 >= a && t0 <= b + 20);
    if (o.jumps) {
      jumpsIn(vert, `article ${slug}`, touching, out);
      jumpsIn(horiz, `views of ${slug}`, touching, out);
    }
    const released = o.touches?.at(-1)?.[1];
    if (released !== undefined) {
      reversalsIn(vert.filter((s) => s.t >= released), `article ${slug}`, out);
      reversalsIn(horiz.filter((s) => s.t >= released), `views of ${slug}`, out);
    }
  }
  if (!o.resizeAt && rec.shift > 0.001) out.push({ kind: 'layout-shift', t: last.t, detail: `layout shift ${rec.shift.toFixed(3)}` });
  return out;
}

// ---------- Pixels: CDP screencast ----------

export interface Screencast {
  stop(): Promise<Violation[]>;
}

/**
 * Records composited frames and flags flashes: a frame whose mean brightness jumps by more than 35%
 * and comes back within two frames, or a frame with 30 points more near-black area than the first.
 */
export async function startScreencast(page: Page): Promise<Screencast> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const shots: Array<{ t: number; data: string }> = [];
  cdp.on('Page.screencastFrame', (f) => {
    shots.push({ t: f.metadata.timestamp ?? 0, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 50, maxWidth: 200, maxHeight: 200, everyNthFrame: 1 });
  return {
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
      const stats = await Promise.all(
        shots.map(async (s) => {
          const { data } = await sharp(Buffer.from(s.data, 'base64')).greyscale().raw().toBuffer({ resolveWithObject: true });
          let sum = 0;
          let dark = 0;
          for (const px of data) {
            sum += px;
            if (px < 8) dark++;
          }
          return { t: s.t, mean: sum / data.length, dark: dark / data.length };
        }),
      );
      const out: Violation[] = [];
      const base = stats[0];
      for (let i = 1; i < stats.length; i++) {
        const prev = stats[i - 1];
        const cur = stats[i];
        const jump = Math.abs(cur.mean - prev.mean) > 0.35 * Math.max(prev.mean, 20);
        const back = [stats[i + 1], stats[i + 2]].some((n) => n && Math.abs(n.mean - prev.mean) < 0.1 * Math.max(prev.mean, 20));
        if (jump && back) out.push({ kind: 'flash', t: cur.t, detail: `brightness ${prev.mean.toFixed(0)} → ${cur.mean.toFixed(0)} and back` });
        if (base && cur.dark - base.dark > 0.3) out.push({ kind: 'flash', t: cur.t, detail: `near-black area ${(cur.dark * 100).toFixed(0)}% (first frame ${(base.dark * 100).toFixed(0)}%)` });
      }
      return out;
    },
  };
}

// ---------- Input ----------

const now = (page: Page) => page.evaluate(() => performance.now());

/** A finger path through the DevTools protocol; resolves with [touch start, release] in page time. */
export async function touchPath(page: Page, points: Array<{ x: number; y: number }>, stepMs = 16): Promise<[number, number]> {
  const cdp = await page.context().newCDPSession(page);
  const start = await now(page);
  const tp = (p: { x: number; y: number }) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(points[0]) });
  for (const p of points.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) });
    if (stepMs) await page.waitForTimeout(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach().catch(() => {});
  return [start, await now(page)];
}

/** Straight line from a to b in n steps (a included). */
export function line(a: { x: number; y: number }, b: { x: number; y: number }, n: number) {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

export async function throttleCpu(page: Page, rate: number): Promise<void> {
  if (rate <= 1) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
}
