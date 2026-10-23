// ArticleSource (markup, CMS file) → ArticleClient (parsed, what the app reads).
import { parseRich } from './markup';
import type { ArticleClient, ArticleSource, Counts, FeedItem, Localized, Rich } from './types';
import { ZERO_COUNTS } from './types';
import { totalWords } from './validate';

const LICENSE_NAME: Record<string, string> = {
  'CC-BY-4.0': 'CC BY 4.0',
  'CC-BY-3.0': 'CC BY 3.0',
  'CC-BY-SA-4.0': 'CC BY-SA 4.0',
  'CC-BY-ND-4.0': 'CC BY-ND 4.0',
  'CC-BY-NC-4.0': 'CC BY-NC 4.0',
  'CC-BY-NC-SA-4.0': 'CC BY-NC-SA 4.0',
  'CC-BY-NC-ND-4.0': 'CC BY-NC-ND 4.0',
  PD: 'Public domain',
  'Reader-CC-BY-4.0': 'CC BY 4.0',
  Copyright: 'All rights reserved',
};
export const licenseName = (l: string) => LICENSE_NAME[l] ?? l;

const CHANGE_VI: Record<string, string> = {
  shortened: 'rút gọn',
  'divided into sections': 'chia thành các phần',
  'highlights added': 'thêm đánh dấu',
  'headings added': 'thêm tiêu đề phụ',
  'lightly edited': 'biên tập nhẹ',
  'key point and apply steps added': 'thêm KEY POINT và các bước Apply',
  'translated to Vietnamese': 'dịch sang tiếng Việt',
  'combined with other sources': 'kết hợp với nguồn khác',
};

function joinAuthors(a: string[], lang: 'en' | 'vi') {
  if (a.length <= 2) return a.join(lang === 'en' ? ' and ' : ' và ');
  return `${a[0]} ${lang === 'en' ? 'et al.' : 'và cộng sự'}`;
}

export function buildAttribution(a: ArticleSource): Localized<string> {
  const o = a.origin;
  const lic = licenseName(o.license);
  const by = joinAuthors(o.authors, 'en');
  const byVi = joinAuthors(o.authors, 'vi');
  const pub = o.publisher ? ` (${o.publisher})` : '';
  const title = o.originalTitle ? `“${o.originalTitle}”` : 'the original';
  const changes = o.changes.filter(Boolean);
  if (o.group === 4) {
    return { en: `Written by ${by} for Reader. Licensed ${lic}.`, vi: `Bài do ${byVi} viết cho Reader. Giấy phép ${lic}.` };
  }
  if (o.group === 5) {
    const src = `${title} by ${by}${pub}`;
    return {
      en: `Reader's own summary of ${src}. The original is not reproduced here: read it in full at the source.`,
      vi: `Bản tóm tắt của Reader về ${title} của ${byVi}${pub}. Bài gốc không được đăng lại ở đây: hãy đọc đầy đủ tại nguồn.`,
    };
  }
  if (o.group === 3) {
    return {
      en: `Republished from ${o.publisher ?? 'the original publisher'} under ${lic}. ${title} by ${by}.`,
      vi: `Đăng lại nguyên văn từ ${o.publisher ?? 'nhà xuất bản gốc'} theo giấy phép ${lic}. ${title} của ${byVi}.`,
    };
  }
  const shareAlike = o.group === 2 ? ` This Reader article is also available under ${lic}.` : '';
  const shareAlikeVi = o.group === 2 ? ` Bài Reader này cũng được cấp phép ${lic}.` : '';
  const en = `Adapted from ${title} by ${by}${pub}, ${lic}.${changes.length ? ` Changes: ${changes.join(', ')}.` : ''}${shareAlike}`;
  const vi = `Phỏng theo ${title} của ${byVi}${pub}, giấy phép ${lic}.${
    changes.length ? ` Thay đổi: ${changes.map((c) => CHANGE_VI[c] ?? c).join(', ')}.` : ''
  }${shareAlikeVi}`;
  return { en, vi };
}

function rich(src: Localized<string> | undefined, refs: Map<string, string>): Localized<Rich> | undefined {
  if (!src?.en) return undefined;
  const out: Localized<Rich> = { en: parseRich(src.en, { refs }).rich };
  if (src.vi?.trim()) out.vi = parseRich(src.vi, { refs }).rich;
  return out;
}

/** Group 3 summaries may exist in Vietnamese only (the English reader has the full text). */
function summaryRich(src: { en?: string; vi?: string }, refs: Map<string, string>): Localized<Rich> {
  const out: Localized<Rich> = { en: src.en?.trim() ? parseRich(src.en, { refs }).rich : [] };
  if (src.vi?.trim()) out.vi = parseRich(src.vi, { refs }).rich;
  return out;
}

export function hasFullVi(a: ArticleSource): boolean {
  return Boolean(
    a.title.vi &&
      a.hook.vi &&
      a.sections.every((s) => s.body_vi && (!s.heading_en || s.heading_vi)) &&
      (!a.keyPoint?.en || a.keyPoint.vi) &&
      (!a.applySteps?.en.length || a.applySteps.vi?.length),
  );
}

export function toClient(a: ArticleSource, counts: Counts = ZERO_COUNTS, extra: { dominant?: string; blurDataURL?: string } = {}): ArticleClient {
  const refs = new Map(a.references.map((r) => [r.id, r.label]));
  const words = totalWords(a);
  return {
    slug: a.slug,
    category: a.category,
    publishedAt: a.publishAt ?? new Date().toISOString(),
    title: a.title.vi ? { en: a.title.en, vi: a.title.vi } : { en: a.title.en },
    hook: rich(a.hook, refs)!,
    sections: a.sections.map((s) => ({
      heading: s.heading_en ? (s.heading_vi ? { en: s.heading_en, vi: s.heading_vi } : { en: s.heading_en }) : undefined,
      body: rich({ en: s.body_en, vi: s.body_vi }, refs)!,
    })),
    keyPoint: rich(a.keyPoint, refs),
    applySteps: a.applySteps?.en.length
      ? { en: a.applySteps.en, ...(a.applySteps.vi?.length ? { vi: a.applySteps.vi } : {}) }
      : undefined,
    summary: a.origin.group === 3 && (a.summary?.en?.trim() || a.summary?.vi?.trim()) ? summaryRich(a.summary, refs) : undefined,
    references: a.references,
    cover: {
      type: a.cover.type,
      url: a.cover.url,
      poster: a.cover.poster,
      blurDataURL: extra.blurDataURL ?? a.blurDataURL,
      dominant: extra.dominant ?? a.dominant ?? '#1a1a22',
      author: a.cover.author,
      authorUrl: a.cover.authorUrl,
      license: a.cover.license,
      provider: a.cover.provider,
      sourceUrl: a.cover.sourceUrl,
    },
    origin: a.origin,
    attribution: buildAttribution(a),
    counts,
    readingMinutes: Math.max(1, Math.round(words / 230)),
    wordCount: words,
    hasVi: hasFullVi(a),
  };
}

export function toFeedItem(c: ArticleClient): FeedItem {
  return {
    slug: c.slug,
    category: c.category,
    publishedAt: c.publishedAt,
    title: c.title,
    cover: c.cover,
    counts: c.counts,
    readingMinutes: c.readingMinutes,
    sections: c.sections.length + 1,
    hasVi: c.hasVi,
  };
}
