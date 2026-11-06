// Mechanical content checks on one article (ACCEPTANCE.md B6): the faults machine translation and
// model output leave behind that the schema and the validator do not catch.
import { plainText } from './markup';
import type { ArticleSource } from './types';
import { isCleanLine } from './validate';

export interface LintIssue {
  field: string;
  rule: string;
  message: string;
}

const JUNK = /_(?:vi|en)\b|\{reference-id|\breference-id:|\{\d+x[0-9a-f]{8,}|\{[0-9a-f]{8}-[0-9a-f]{4}-/i;
/** Vietnamese letters that only appear with diacritics; a long "Vietnamese" text without them was not translated. */
const VI_MARKS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

export function lintArticle(a: ArticleSource): LintIssue[] {
  const out: LintIssue[] = [];
  const refs = new Map(a.references.map((r) => [r.id, r.label]));
  const text = (s: string | undefined) => (s ? plainText(s, refs) : '');
  const add = (field: string, rule: string, message: string) => out.push({ field, rule, message });

  const pairs: Array<[string, string | undefined, string | undefined, boolean]> = [
    ['hook', a.hook.en, a.hook.vi, false],
    ['keyPoint', a.keyPoint?.en, a.keyPoint?.vi, false],
    ['summary', a.summary?.en, a.summary?.vi, false],
    ...a.sections.map((s, i): [string, string | undefined, string | undefined, boolean] => [`sections.${i}.body`, s.body_en, s.body_vi, false]),
    ['title', a.title.en, a.title.vi, true],
    ...a.sections.map((s, i): [string, string | undefined, string | undefined, boolean] => [`sections.${i}.heading`, s.heading_en, s.heading_vi, true]),
  ];
  for (const [field, en, vi, line] of pairs) {
    for (const [lang, s] of [['en', en], ['vi', vi]] as const) if (s && JUNK.test(s)) add(`${field}.${lang}`, 'junk-token', `model artefact in "${s.slice(0, 60)}"`);
    if (!vi) continue;
    if (line) {
      if (en !== undefined && !isCleanLine(vi, en)) add(`${field}.vi`, 'not-a-line', 'must be one short plain line');
      continue;
    }
    const e = text(en);
    const v = text(vi);
    // Short texts (labels, one-line bodies) vary too much in length to judge.
    if (e.length >= 120) {
      const ratio = v.length / e.length;
      if (ratio < 0.5 || ratio > 2.6) add(`${field}.vi`, 'length-ratio', `Vietnamese is ${ratio.toFixed(2)}× the English length`);
    }
    if (v.length >= 80 && !VI_MARKS.test(v)) add(`${field}.vi`, 'untranslated', 'Vietnamese text has no Vietnamese letters');
  }
  a.sections.forEach((s, i) => {
    for (const [lang, h, b] of [['en', s.heading_en, s.body_en], ['vi', s.heading_vi, s.body_vi]] as const)
      if (h && b && text(h).length > text(b).length) add(`sections.${i}.heading_${lang}`, 'heading-longer-than-body', 'heading and body look swapped');
  });
  for (const [lang, field] of [['en', a.hook.en], ['vi', a.hook.vi]] as const) {
    const words = text(field).toLowerCase().split(/\s+/).filter(Boolean);
    const seen = new Map<string, number>();
    for (let i = 0; i + 6 <= words.length; i++) {
      const g = words.slice(i, i + 6).join(' ');
      seen.set(g, (seen.get(g) ?? 0) + 1);
    }
    for (const [g, n] of seen) if (n >= 3) add(`hook.${lang}`, 'repeated-phrase', `"${g}" ×${n}`);
  }
  return out;
}
