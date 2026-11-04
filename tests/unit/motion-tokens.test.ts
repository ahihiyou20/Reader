import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dur, pressScale, spring, springCSS, stagger } from '@/lib/motion';

describe('CSS token synchronization (TESTSPEC §5, ARCHITECTURE §3)', () => {
  const cssPath = path.resolve(process.cwd(), 'app/globals.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  const rootMatch = cssContent.match(/:root\s*\{([^}]+)\}/);
  const rootBlock = rootMatch ? rootMatch[1] : '';

  it('finds the first :root block in app/globals.css', () => {
    expect(rootBlock.length).toBeGreaterThan(0);
  });

  const durKeys = Object.keys(dur) as (keyof typeof dur)[];

  it.each(durKeys)('defines --dur-%s in :root matching dur.%s', (key) => {
    const regex = new RegExp(`--dur-${key}\\s*:\\s*(\\d+)ms`);
    const match = rootBlock.match(regex);
    expect(match, `Missing or malformed --dur-${key} in app/globals.css :root`).not.toBeNull();
    const parsedValue = match ? Number.parseInt(match[1], 10) : Number.NaN;
    expect(parsedValue).toBe(dur[key]);
  });

  it('defines --ease-spring in :root matching springCSS ignoring whitespace', () => {
    const match = rootBlock.match(/--ease-spring\s*:\s*([^;]+);/);
    expect(match, 'Missing --ease-spring in app/globals.css :root').not.toBeNull();
    const cssEase = match ? match[1].replace(/\s+/g, '') : '';
    const expectedEase = springCSS.replace(/\s+/g, '');
    expect(cssEase).toBe(expectedEase);
  });
});

describe('Motion token bands (TESTSPEC §5, ARCHITECTURE §3)', () => {
  it('verifies dur tokens fall within craft bands', () => {
    // dur.press: 100–160 ms
    expect(dur.press).toBeGreaterThanOrEqual(100);
    expect(dur.press).toBeLessThanOrEqual(160);

    // dur.release: ≤ 250 ms
    expect(dur.release).toBeGreaterThan(0);
    expect(dur.release).toBeLessThanOrEqual(250);

    // dur.hover: 100–200 ms
    expect(dur.hover).toBeGreaterThanOrEqual(100);
    expect(dur.hover).toBeLessThanOrEqual(200);

    // dur.focus: ≤ 160 ms
    expect(dur.focus).toBeGreaterThan(0);
    expect(dur.focus).toBeLessThanOrEqual(160);

    // dur.small: 125–250 ms
    expect(dur.small).toBeGreaterThanOrEqual(125);
    expect(dur.small).toBeLessThanOrEqual(250);

    // dur.exit: ≤ dur.small
    expect(dur.exit).toBeGreaterThan(0);
    expect(dur.exit).toBeLessThanOrEqual(dur.small);

    // dur.medium: ≤ 300 ms
    expect(dur.medium).toBeGreaterThan(0);
    expect(dur.medium).toBeLessThanOrEqual(300);

    // dur.count: 150–300 ms
    expect(dur.count).toBeGreaterThanOrEqual(150);
    expect(dur.count).toBeLessThanOrEqual(300);

    // dur.fill: ≤ 300 ms
    expect(dur.fill).toBeGreaterThan(0);
    expect(dur.fill).toBeLessThanOrEqual(300);

    // dur.draw: ≤ 300 ms
    expect(dur.draw).toBeGreaterThan(0);
    expect(dur.draw).toBeLessThanOrEqual(300);

    // dur.crossfade: ≤ 200 ms
    expect(dur.crossfade).toBeGreaterThan(0);
    expect(dur.crossfade).toBeLessThanOrEqual(200);

    // dur.decode: ≤ 500 ms
    expect(dur.decode).toBeGreaterThan(0);
    expect(dur.decode).toBeLessThanOrEqual(500);

    // dur.stage: 300–600 ms
    expect(dur.stage).toBeGreaterThanOrEqual(300);
    expect(dur.stage).toBeLessThanOrEqual(600);

    // dur.sweep: ≤ 700 ms
    expect(dur.sweep).toBeGreaterThan(0);
    expect(dur.sweep).toBeLessThanOrEqual(700);
  });

  it('verifies stagger tokens fall within craft bands', () => {
    // stagger.list: 30–80 ms
    expect(stagger.list).toBeGreaterThanOrEqual(30);
    expect(stagger.list).toBeLessThanOrEqual(80);

    // stagger.menu: ≤ 40 ms
    expect(stagger.menu).toBeGreaterThan(0);
    expect(stagger.menu).toBeLessThanOrEqual(40);
  });

  it('verifies pressScale tokens fall within craft bands', () => {
    // pressScale.icon: 0.95–0.97
    expect(pressScale.icon).toBeGreaterThanOrEqual(0.95);
    expect(pressScale.icon).toBeLessThanOrEqual(0.97);

    // pressScale.card: 0.97–0.99
    expect(pressScale.card).toBeGreaterThanOrEqual(0.97);
    expect(pressScale.card).toBeLessThanOrEqual(0.99);
  });

  it('verifies every spring.* has bounce <= 0.35', () => {
    const springEntries = [
      ['default', spring.default],
      ['flick', spring.flick],
      ['sheet', spring.sheet],
      ['pop', spring.pop],
    ] as const;

    for (const [name, config] of springEntries) {
      expect(config.bounce, `spring.${name}.bounce must be defined`).toBeDefined();
      expect(config.bounce, `spring.${name}.bounce exceeds 0.35`).toBeLessThanOrEqual(0.35);
      expect(config.bounce, `spring.${name}.bounce must be non-negative`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('springCSS (TESTSPEC §5, ARCHITECTURE §3)', () => {
  interface LinearPoint {
    value: number;
    percentage: number;
  }

  function parseLinearCSS(linearStr: string): LinearPoint[] {
    const match = linearStr.match(/^linear\((.+)\)$/);
    if (!match) {
      throw new Error(`Failed to parse linear() CSS function: "${linearStr}"`);
    }
    const pointStrings = match[1].split(',');
    return pointStrings.map((ptStr) => {
      const parts = ptStr.trim().split(/\s+/);
      if (parts.length < 2) {
        throw new Error(`Invalid point in linear(): "${ptStr}"`);
      }
      const val = Number.parseFloat(parts[0]);
      const pct = Number.parseFloat(parts[1].replace('%', ''));
      return { value: val, percentage: pct };
    });
  }

  it('parses as linear(v p%, ...) with at least 10 points', () => {
    expect(springCSS).toMatch(/^linear\((.+)\)$/);
    const points = parseLinearCSS(springCSS);
    expect(points.length).toBeGreaterThanOrEqual(10);
  });

  it('starts at 0 0% and ends at 1 100%', () => {
    const points = parseLinearCSS(springCSS);
    expect(points[0]).toEqual({ value: 0, percentage: 0 });
    expect(points[points.length - 1]).toEqual({ value: 1, percentage: 100 });
  });

  it('has non-decreasing values', () => {
    const points = parseLinearCSS(springCSS);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].value).toBeGreaterThanOrEqual(points[i - 1].value);
    }
  });

  it('has strictly increasing percentages', () => {
    const points = parseLinearCSS(springCSS);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].percentage).toBeGreaterThan(points[i - 1].percentage);
    }
  });
});
