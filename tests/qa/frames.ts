import type { Page } from '@playwright/test';

export interface FrameSample<T = unknown> {
  timestamp: number;
  data: T;
}

/**
 * Evaluates a sampler function source on each animation frame for `ms` milliseconds,
 * returning recorded samples with performance.now() timestamps.
 */
export async function recordFrames<T = unknown>(
  page: Page,
  samplerSource: string | ((now: number) => T),
  ms: number,
): Promise<Array<FrameSample<T>>> {
  const fnSource = typeof samplerSource === 'function' ? samplerSource.toString() : samplerSource;
  return await page.evaluate(
    ({ source, duration }) => {
      return new Promise<Array<{ timestamp: number; data: T }>>((resolve) => {
        let sampler: (now: number) => T;
        try {
          const parsed = (0, eval)('(' + source + ')');
          if (typeof parsed === 'function') {
            sampler = parsed as (now: number) => T;
          } else {
            sampler = new Function('now', source) as (now: number) => T;
          }
        } catch {
          sampler = new Function('now', source) as (now: number) => T;
        }

        const samples: Array<{ timestamp: number; data: T }> = [];
        const start = performance.now();

        function step(now: number) {
          try {
            const data = sampler(now);
            samples.push({ timestamp: now, data });
          } catch {
            samples.push({ timestamp: now, data: null as unknown as T });
          }
          if (now - start >= duration) {
            resolve(samples);
          } else {
            requestAnimationFrame(step);
          }
        }
        requestAnimationFrame(step);
      });
    },
    { source: fnSource, duration: ms },
  );
}
