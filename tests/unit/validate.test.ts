import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toClient } from '@/lib/content/transform';
import { validateArticle } from '@/lib/content/validate';

const seed = JSON.parse(fs.readFileSync('content/articles/smarter-decisions.json', 'utf8'));

describe('validateArticle (docs/05 step 7)', () => {
  it('accepts the seed article', () => {
    const r = validateArticle(seed, { categories: ['psychology'] });
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('rejects chips that point nowhere', () => {
    const a = structuredClone(seed);
    a.sections[0].body_en += ' {missing-ref}';
    expect(validateArticle(a).issues.some((i) => i.level === 'error' && /Unknown reference/.test(i.message))).toBe(true);
  });
  it('requires unreviewed AI output to be reviewed before publishing', () => {
    const a = { ...structuredClone(seed), ai: { fields: ['vi'], reviewed: false } };
    expect(validateArticle(a).ok).toBe(false);
    expect(validateArticle({ ...a, status: 'draft' }).ok).toBe(true);
  });
  it('keeps CC BY-ND articles verbatim and untranslated', () => {
    const a = structuredClone(seed);
    a.origin = { group: 3, license: 'CC-BY-ND-4.0', authors: ['A'], originalTitle: 'T', originalUrl: 'https://x', changes: [] };
    const issues = validateArticle(a).issues.filter((i) => i.level === 'error').map((i) => i.message);
    expect(issues).toContain('Group 3 text cannot carry highlights or chips');
  });
  it('rejects licences outside the allowed list', () => {
    const a = structuredClone(seed);
    a.origin.license = 'GPL-3.0';
    expect(validateArticle(a).ok).toBe(false);
  });
  it('accepts NonCommercial licences in the matching group (personal, non-commercial site)', () => {
    const a = structuredClone(seed);
    a.origin = { group: 1, license: 'CC-BY-NC-4.0', authors: ['A'], originalTitle: 'T', originalUrl: 'https://x', changes: ['shortened'] };
    expect(validateArticle(a).ok).toBe(true);
    a.origin.license = 'CC-BY-NC-SA-4.0';
    expect(validateArticle(a).issues.map((i) => i.message)).toContain('Group 1 sources are CC BY, CC BY-NC or public domain');
    a.origin.group = 2;
    expect(validateArticle(a).ok).toBe(true);
  });
  it('keeps group 5 summaries short and linked to the original', () => {
    const a = structuredClone(seed);
    a.origin = { group: 5, license: 'Copyright', authors: ['A'], originalTitle: 'T', publisher: 'P', changes: ['summarised by Reader'] };
    const errors = (x: unknown) => validateArticle(x).issues.filter((i) => i.level === 'error').map((i) => i.message);
    expect(errors(a)).toContain('Link to the original is required');
    a.origin.originalUrl = 'https://example.com/a';
    expect(errors(a).some((m) => /a summary must stay under 450 words/.test(m))).toBe(true);
    a.sections = a.sections.slice(0, 3).map((s: { body_en: string }) => ({ ...s, body_en: s.body_en.split(' ').slice(0, 60).join(' ') }));
    expect(errors(a)).toEqual([]);
  });
  it('builds a "summary of" attribution for group 5', () => {
    const a = structuredClone(seed);
    a.origin = { group: 5, license: 'Copyright', authors: ['Ann Lee'], originalTitle: 'Why we nap', originalUrl: 'https://e.com', publisher: 'Psyche', changes: [] };
    const c = toClient(a);
    expect(c.attribution.en).toMatch(/^Reader's own summary of “Why we nap” by Ann Lee \(Psyche\)/);
    expect(c.attribution.vi).toMatch(/Bản tóm tắt của Reader/);
  });
  it('flags unknown categories', () => {
    expect(validateArticle(seed, { categories: ['science'] }).ok).toBe(false);
  });
});

describe('toClient', () => {
  it('parses markup and builds attribution', () => {
    const c = toClient(seed);
    expect(c.hasVi).toBe(true);
    expect(c.sections[0].heading?.vi).toBeTruthy();
    expect(c.attribution.en).toMatch(/Reader/);
    expect(c.readingMinutes).toBeGreaterThan(1);
    expect(c.sections[0].body.en[0].some((n) => n.t === 'cite')).toBe(true);
  });
});
