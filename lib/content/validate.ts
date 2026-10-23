// Content checks shared by build-content, the validate workflow and the preview page (docs/05 step 7).
import { articleSourceSchema } from './schema';
import { citedIds, countWords, highlightCount, parseRich, plainText } from './markup';
import type { ArticleSource } from './types';
import { NO_DERIVATIVES, SHARE_ALIKE } from './types';

export type Level = 'error' | 'warning' | 'info';
export interface Issue {
  level: Level;
  field: string;
  message: string;
}
export interface ValidationResult {
  ok: boolean;
  issues: Issue[];
  wordCount: number;
  article?: ArticleSource;
}

export const LIMITS = {
  hookWords: [40, 80] as const,
  sections: [5, 7] as const,
  totalWords: [700, 950] as const,
  sectionWords: 130,
  highlightsPerSection: 3,
  keyPointWords: [40, 60] as const,
  titleWords: 12,
  /** Group 5 (summary + link): short enough that it never replaces the original. */
  summarySections: [2, 5] as const,
  summaryWords: [150, 400] as const,
  summaryMaxWords: 450,
};

export function totalWords(a: Pick<ArticleSource, 'hook' | 'sections' | 'references'>): number {
  const refs = Object.fromEntries((a.references ?? []).map((r) => [r.id, r.label]));
  return [a.hook.en, ...a.sections.map((s) => s.body_en)].reduce((n, s) => n + countWords(plainText(s, refs)), 0);
}

export interface ValidateOptions {
  /** Known categories; unknown ones are an error when given. */
  categories?: string[];
  /** For group 3 (verbatim) articles: the imported raw text that the body must equal. */
  rawBody?: string[];
  /** Licence recorded in content/sources/<id>.json, when available. */
  sourceLicense?: string;
}

export function validateArticle(input: unknown, opts: ValidateOptions = {}): ValidationResult {
  const issues: Issue[] = [];
  const err = (field: string, message: string) => issues.push({ level: 'error', field, message });
  const warn = (field: string, message: string) => issues.push({ level: 'warning', field, message });
  const info = (field: string, message: string) => issues.push({ level: 'info', field, message });

  const parsed = articleSourceSchema.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues) err(i.path.join('.') || 'file', i.message);
    return { ok: false, issues, wordCount: 0 };
  }
  const a = parsed.data as ArticleSource;
  const refIds = new Map(a.references.map((r) => [r.id, r.label]));
  if (refIds.size !== a.references.length) err('references', 'Duplicate reference id');

  // Markup and chips
  const check = (field: string, src: string | undefined) => {
    if (!src) return;
    for (const e of parseRich(src, { refs: refIds }).errors) err(field, e.message);
  };
  check('hook.en', a.hook.en);
  check('hook.vi', a.hook.vi);
  a.sections.forEach((s, i) => {
    check(`sections.${i}.body_en`, s.body_en);
    check(`sections.${i}.body_vi`, s.body_vi);
  });
  check('keyPoint.en', a.keyPoint?.en);
  check('keyPoint.vi', a.keyPoint?.vi);
  check('summary.en', a.summary?.en);
  check('summary.vi', a.summary?.vi);

  if (opts.categories && !opts.categories.includes(a.category)) err('category', `Unknown category "${a.category}"`);

  // Licence and attribution
  const o = a.origin;
  if (o.group !== 4 && !o.originalUrl) err('origin.originalUrl', 'Link to the original is required');
  if (o.group !== 4 && !o.originalTitle) err('origin.originalTitle', 'Original title is required');
  if (o.group === 1 && (SHARE_ALIKE.includes(o.license) || NO_DERIVATIVES.includes(o.license) || ['Copyright', 'Reader-CC-BY-4.0'].includes(o.license)))
    err('origin.license', 'Group 1 sources are CC BY, CC BY-NC or public domain');
  if (o.group === 2 && !SHARE_ALIKE.includes(o.license)) err('origin.license', 'Share-alike sources must keep CC BY-SA 4.0 or CC BY-NC-SA 4.0');
  if (o.group === 3 && !NO_DERIVATIVES.includes(o.license)) err('origin.license', 'Group 3 sources are CC BY-ND 4.0 or CC BY-NC-ND 4.0');
  if (o.group === 4 && o.license !== 'Reader-CC-BY-4.0') err('origin.license', 'Self-written articles use Reader-CC-BY-4.0');
  if (o.group === 5 && o.license === 'Reader-CC-BY-4.0') err('origin.license', 'Group 5 records the licence of the summarised original');
  if (a.summary && o.group !== 3) warn('summary', 'The summary field is only shown for group 3 (verbatim) articles');
  if ((o.group === 1 || o.group === 2) && o.changes.length === 0) err('origin.changes', 'List the changes made to the source');
  if (opts.sourceLicense && opts.sourceLicense !== o.license)
    err('origin.license', `Licence ${o.license} does not match the imported source (${opts.sourceLicense})`);
  if (o.group === 3 && opts.rawBody) {
    const body = [a.hook.en, ...a.sections.map((s) => s.body_en)].map((s) => s.trim());
    const raw = opts.rawBody.map((s) => s.trim());
    if (body.length !== raw.length || body.some((s, i) => s !== raw[i]))
      err('sections', 'Group 3 (CC BY-ND) text must match the original word for word');
  }
  if (o.group === 3) {
    const marked = [a.hook.en, ...a.sections.map((s) => s.body_en)].some((s) => /\[[ypg]:|\*\*|\{[a-z0-9]/i.test(s));
    if (marked) err('sections', 'Group 3 text cannot carry highlights or chips');
    if (a.hook.vi || a.sections.some((s) => s.body_vi)) err('sections', 'Group 3 text cannot be translated without permission');
  }

  // Publishing
  if (a.status === 'published') {
    if (!a.publishAt) err('publishAt', 'Set a publish date');
    else if (Number.isNaN(Date.parse(a.publishAt))) err('publishAt', 'Publish date is not a valid date');
    if (a.ai && a.ai.fields.length > 0 && !a.ai.reviewed) err('ai.reviewed', 'Review the AI suggestions before publishing');
  }
  if (a.seed) warn('seed', 'Launch content prepared by the developers: check facts and translation, then clear "seed"');

  // Length and structure (warnings: the editor decides)
  const words = totalWords(a);
  const hookWords = countWords(plainText(a.hook.en, refIds));
  if (o.group === 5) {
    // Summary + link: Reader's own words, kept short so the original stays the place to read it.
    if (words > LIMITS.summaryMaxWords) err('sections', `${words} words: a summary must stay under ${LIMITS.summaryMaxWords} words`);
    else if (words < LIMITS.summaryWords[0] || words > LIMITS.summaryWords[1])
      warn('sections', `${words} words in total (aim for ${LIMITS.summaryWords.join('–')})`);
    if (a.sections.length < LIMITS.summarySections[0] || a.sections.length > LIMITS.summarySections[1])
      warn('sections', `${a.sections.length} sections (aim for ${LIMITS.summarySections.join('–')})`);
  } else if (o.group !== 3) {
    if (hookWords < LIMITS.hookWords[0] || hookWords > LIMITS.hookWords[1])
      warn('hook.en', `Hook has ${hookWords} words (aim for ${LIMITS.hookWords.join('–')})`);
    if (a.sections.length < LIMITS.sections[0] || a.sections.length > LIMITS.sections[1])
      warn('sections', `${a.sections.length} sections (aim for ${LIMITS.sections.join('–')})`);
    if (words < LIMITS.totalWords[0] || words > LIMITS.totalWords[1])
      warn('sections', `${words} words in total (aim for ${LIMITS.totalWords.join('–')})`);
    a.sections.forEach((s, i) => {
      const n = countWords(plainText(s.body_en, refIds));
      if (n > LIMITS.sectionWords) warn(`sections.${i}.body_en`, `${n} words (max ${LIMITS.sectionWords})`);
      const h = highlightCount(s.body_en);
      if (h > LIMITS.highlightsPerSection) warn(`sections.${i}.body_en`, `${h} highlights (max ${LIMITS.highlightsPerSection})`);
    });
  }
  if (countWords(a.title.en) > LIMITS.titleWords) warn('title.en', `Title is longer than ${LIMITS.titleWords} words`);
  if (!a.keyPoint?.en?.trim()) warn('keyPoint', 'Add a KEY POINT');
  else {
    const n = countWords(plainText(a.keyPoint.en, refIds));
    if (n < LIMITS.keyPointWords[0] || n > LIMITS.keyPointWords[1])
      warn('keyPoint.en', `KEY POINT has ${n} words (aim for ${LIMITS.keyPointWords.join('–')})`);
  }
  if (!a.applySteps || a.applySteps.en.filter((s) => s.trim()).length !== 3) warn('applySteps', 'Add exactly 3 Apply steps');
  if (a.applySteps?.vi && a.applySteps.vi.length !== a.applySteps.en.length)
    warn('applySteps.vi', 'Vietnamese Apply steps do not match the English ones');

  const cited = new Set([a.hook.en, ...a.sections.map((s) => s.body_en), a.keyPoint?.en].flatMap((s) => citedIds(s)));
  for (const r of a.references) if (!cited.has(r.id)) info('references', `Reference "${r.id}" is listed but not cited`);

  // Vietnamese
  const missingVi =
    !a.title.vi ||
    !a.hook.vi ||
    a.sections.some((s) => !s.body_vi || (s.heading_en && !s.heading_vi)) ||
    (a.keyPoint?.en && !a.keyPoint.vi) ||
    (a.applySteps?.en.length && !a.applySteps.vi?.length);
  if (missingVi && o.group !== 3) info('vi', 'Vietnamese version is incomplete (readers will see "EN only")');
  if (o.group === 3 && !a.summary?.vi?.trim()) info('summary.vi', 'Add a Vietnamese summary for readers who switch to Vietnamese');

  return { ok: !issues.some((i) => i.level === 'error'), issues, wordCount: words, article: a };
}
