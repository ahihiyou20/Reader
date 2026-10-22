// Pick the stretch of the source that fits Reader's length (docs/05 step 3).
import type { ImportedSection } from './adapters/types';
import { wordCount } from './lib';

export interface Window {
  sections: ImportedSection[];
  words: number;
  needsTrim: boolean;
  shortened: boolean;
}

const words = (s: ImportedSection) => s.paragraphs.reduce((n, p) => n + wordCount(p), 0);

/**
 * Among all runs of consecutive sections whose total is within [min, max], take the one with the most
 * headings (ties: closest to the middle of the range). If none fits, take the first run that passes
 * `min` and flag it for trimming. Short sources are returned whole.
 */
export function selectWindow(all: ImportedSection[], min = 700, max = 950): Window {
  const w = all.map(words);
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= max) return { sections: all, words: total, needsTrim: false, shortened: false };
  let best: { i: number; j: number; score: number; sum: number } | null = null;
  for (let i = 0; i < all.length; i++) {
    let sum = 0;
    for (let j = i; j < all.length; j++) {
      sum += w[j];
      if (sum > max) break;
      if (sum < min) continue;
      const headings = all.slice(i, j + 1).filter((s) => s.heading).length;
      const score = headings * 1000 - Math.abs(sum - (min + max) / 2) - i;
      if (!best || score > best.score) best = { i, j, score, sum };
    }
  }
  if (best) return { sections: all.slice(best.i, best.j + 1), words: best.sum, needsTrim: false, shortened: true };
  let sum = 0;
  for (let j = 0; j < all.length; j++) {
    sum += w[j];
    if (sum >= min) return { sections: all.slice(0, j + 1), words: sum, needsTrim: sum > max, shortened: j < all.length - 1 };
  }
  return { sections: all, words: total, needsTrim: true, shortened: false };
}
