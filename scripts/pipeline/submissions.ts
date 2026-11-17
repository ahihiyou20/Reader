// Step 10 (docs/05): posts sent with the + button become review drafts in the repo, and their
// authors see the outcome in Profile. Runs every 6 hours in GitHub Actions with the Admin SDK.
import path from 'node:path';
import type { ArticleSource, Lang } from '../../lib/content/types';
import { admin, hasAdminCredentials } from './admin';
import { dirs, exists, jobSummary, previewUrl, readJson, uniqueSlug, writeJson } from './lib';

interface Submission {
  uid: string;
  displayName: string;
  title: string;
  hook: string;
  sections: Array<{ heading?: string; body: string }>;
  references: string[];
  coverUrl?: string;
  lang: Lang;
  status: 'pending' | 'imported' | 'published' | 'rejected';
  slug?: string;
}

// Text from readers is treated as plain text: markup characters are escaped.
const esc = (s: string) => s.replace(/([\\*[\]{}])/g, '\\$1').trim();
/** Firestore rules check a post's shape, not each item: a field may be missing or not text. */
const text = (v: unknown) => (typeof v === 'string' ? esc(v) : '');
const httpUrl = (v: unknown) => {
  try {
    return typeof v === 'string' && /^https?:$/.test(new URL(v).protocol) ? new URL(v) : null;
  } catch {
    return null;
  }
};

function coverFrom(url: string | undefined): ArticleSource['cover'] {
  if (url && /^https:\/\/(images\.unsplash\.com|images\.pexels\.com)\//.test(url))
    return { type: 'image', url, provider: url.includes('unsplash') ? 'unsplash' : 'pexels', author: 'Unknown — check before publishing', license: url.includes('unsplash') ? 'Unsplash License' : 'Pexels License', sourceUrl: url };
  return { type: 'image', url: '/icons/og-pagemoor.jpg', provider: 'own', author: 'Pagemoor', license: 'CC BY 4.0', ...(url ? { sourceUrl: url } : {}) };
}

export function toDraft(id: string, s: Submission, slug: string): ArticleSource {
  const L = s.lang;
  const refs = (s.references ?? [])
    .map(httpUrl)
    .filter((u): u is URL => u !== null)
    .slice(0, 20)
    .map((u, i) => ({ id: `ref-${i + 1}`, label: u.hostname.replace(/^www\./, ''), url: u.href }));
  const sections = (s.sections ?? [])
    .filter((x) => text(x?.body))
    .map((x) => ({ ...(text(x.heading) ? { [`heading_${L}`]: text(x.heading) } : {}), [`body_${L}`]: text(x.body) })) as ArticleSource['sections'];
  if (!sections.length) sections.push({ [`body_${L}`]: '(empty post)' } as ArticleSource['sections'][number]);
  // The schema needs English fields; for posts in another language the editor translates (or asks Gemini).
  const en = (v: string) => (L === 'en' ? v : `(translate) ${v}`);
  if (L !== 'en') for (const sec of sections) sec.body_en ??= en(sec[`body_${L}`] ?? '');
  return {
    slug,
    status: 'review',
    previewUrl: previewUrl(slug),
    category: 'society',
    tags: [],
    title: { en: en(text(s.title)), ...(L === 'en' ? {} : { [L]: text(s.title) }) },
    hook: { en: en(text(s.hook)), ...(L === 'en' ? {} : { [L]: text(s.hook) }) },
    sections,
    references: refs,
    cover: coverFrom(s.coverUrl),
    origin: { group: 4, submissionId: id, license: 'Reader-CC-BY-4.0', authors: [s.displayName || 'Reader community'], changes: [] },
  };
}

async function main() {
  if (!hasAdminCredentials()) {
    console.log('No Firebase credentials: skipping submissions.');
    return;
  }
  const { db } = admin();
  const lines: string[] = [];
  // 1. New posts → review drafts.
  const pending = await db.collection('submissions').where('status', '==', 'pending').limit(50).get();
  for (const doc of pending.docs) {
    const s = doc.data() as Submission;
    try {
      const slug = await uniqueSlug(typeof s.title === 'string' ? s.title : 'post');
      await writeJson(path.join(dirs.articles, `${slug}.json`), toDraft(doc.id, s, slug));
      await doc.ref.update({ status: 'imported', slug });
      lines.push(`- New post “${s.title}” by ${s.displayName} → \`${slug}\` (review)`);
    } catch (e) {
      // A post that cannot become a draft must not block the ones after it on every run.
      await doc.ref.update({ status: 'rejected' });
      lines.push(`- Post ${doc.id} rejected: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  // 2. Report the outcome back to the author.
  const imported = await db.collection('submissions').where('status', '==', 'imported').limit(200).get();
  for (const doc of imported.docs) {
    const s = doc.data() as Submission;
    if (!s.slug) continue;
    const file = path.join(dirs.articles, `${s.slug}.json`);
    if (!(await exists(file))) {
      await doc.ref.update({ status: 'rejected' });
      lines.push(`- \`${s.slug}\` was removed → rejected`);
      continue;
    }
    const a = await readJson<ArticleSource>(file);
    if (a.status === 'published' && (!a.publishAt || Date.parse(a.publishAt) <= Date.now())) {
      await doc.ref.update({ status: 'published' });
      lines.push(`- \`${s.slug}\` published`);
    } else if (a.status === 'unpublished') {
      await doc.ref.update({ status: 'rejected' });
      lines.push(`- \`${s.slug}\` not accepted`);
    }
  }
  const md = lines.length ? lines.join('\n') : 'No changes.';
  console.log(md);
  await jobSummary(`## Submissions\n\n${md}`);
}

if (process.argv[1]?.endsWith('submissions.ts')) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
