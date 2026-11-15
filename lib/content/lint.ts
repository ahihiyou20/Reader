// Mechanical content checks on one article (ACCEPTANCE.md B6): the faults machine translation and
// model output leave behind that the schema and the validator do not catch.
import { plainText } from './markup';
import { LANG_NAME, LANGS, TLANGS, type ArticleSource, type TLang } from './types';
import { isCleanLine } from './validate';

export interface LintIssue {
  field: string;
  rule: string;
  message: string;
}

const JUNK = /_(?:vi|en|fr|de|es)\b|\{reference-id|\breference-id:|\{\d+x[0-9a-f]{8,}|\{[0-9a-f]{8}-[0-9a-f]{4}-/i;
/** Vietnamese letters that only appear with diacritics; a long "Vietnamese" text without them was not translated. */
const VI_MARKS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

export function lintArticle(a: ArticleSource): LintIssue[] {
  const out: LintIssue[] = [];
  const refs = new Map(a.references.map((r) => [r.id, r.label]));
  const text = (s: string | undefined) => (s ? plainText(s, refs) : '');
  const add = (field: string, rule: string, message: string) => out.push({ field, rule, message });

  type Field = { name: string; get: (l: 'en' | TLang) => string | undefined; line: boolean };
  const fields: Field[] = [
    { name: 'hook', get: (l) => a.hook[l], line: false },
    { name: 'keyPoint', get: (l) => a.keyPoint?.[l], line: false },
    { name: 'summary', get: (l) => a.summary?.[l], line: false },
    ...a.sections.map((s, i): Field => ({ name: `sections.${i}.body`, get: (l) => s[`body_${l}`], line: false })),
    { name: 'title', get: (l) => a.title[l], line: true },
    ...a.sections.map((s, i): Field => ({ name: `sections.${i}.heading`, get: (l) => s[`heading_${l}`], line: true })),
  ];
  for (const { name, get, line } of fields) {
    const en = get('en');
    for (const l of LANGS) {
      const s = get(l);
      if (s && JUNK.test(s)) add(`${name}.${l}`, 'junk-token', `model artefact in "${s.slice(0, 60)}"`);
    }
    for (const l of TLANGS) {
      const tr = get(l);
      if (!tr) continue;
      if (line) {
        if (en !== undefined && !isCleanLine(tr, en)) add(`${name}.${l}`, 'not-a-line', 'must be one short plain line');
        continue;
      }
      const e = text(en);
      const v = text(tr);
      // Short texts (labels, one-line bodies) vary too much in length to judge.
      if (e.length >= 120) {
        const ratio = v.length / e.length;
        if (ratio < 0.5 || ratio > 2.6) add(`${name}.${l}`, 'length-ratio', `${LANG_NAME[l]} is ${ratio.toFixed(2)}× the English length`);
      }
      if (v.length >= 80 && (l === 'vi' ? !VI_MARKS.test(v) : v === e)) add(`${name}.${l}`, 'untranslated', `${LANG_NAME[l]} text was not translated`);
    }
  }
  a.sections.forEach((s, i) => {
    for (const l of LANGS) {
      const h = s[`heading_${l}`];
      const b = s[`body_${l}`];
      if (h && b && text(h).length > text(b).length) add(`sections.${i}.heading_${l}`, 'heading-longer-than-body', 'heading and body look swapped');
    }
  });
  for (const lang of LANGS) {
    const words = text(a.hook[lang]).toLowerCase().split(/\s+/).filter(Boolean);
    const seen = new Map<string, number>();
    for (let i = 0; i + 6 <= words.length; i++) {
      const g = words.slice(i, i + 6).join(' ');
      seen.set(g, (seen.get(g) ?? 0) + 1);
    }
    for (const [g, n] of seen) if (n >= 3) add(`hook.${lang}`, 'repeated-phrase', `"${g}" ×${n}`);
  }
  return out;
}
