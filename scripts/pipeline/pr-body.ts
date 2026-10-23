// Body of the rolling "new articles" pull request: every article the branch adds, with preview links.
//   pnpm tsx scripts/pipeline/pr-body.ts <base-ref> > body.md
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { validateArticle } from '../../lib/content/validate';
import type { Created } from './create';
import { reportTable } from './feeds';
import { dirs, readJson } from './lib';

async function main() {
  const base = process.argv[2] ?? 'origin/main';
  const files = execFileSync('git', ['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', 'content/articles'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.json'));
  const rows: Created[] = [];
  for (const f of files) {
    const a = await readJson<ArticleSource>(path.join(dirs.articles, path.basename(f)));
    const check = validateArticle(a);
    rows.push({ slug: a.slug, group: a.origin.group, title: a.title.en, words: check.wordCount, url: a.origin.originalUrl, issues: check.issues, ai: a.ai?.fields ?? [] });
  }
  console.log(
    [
      `Bot tìm được **${rows.length} bài mới** từ các nguồn trong \`content/feeds.json\` (tối đa 20 bài/ngày).`,
      '',
      '- **Merge** pull request này = duyệt và đăng tất cả (kể cả phần do Gemini viết: bản tiếng Việt, KEY POINT, Apply, tóm tắt).',
      '- Không muốn bài nào: xoá file `content/articles/<slug>.json` của bài đó trong pull request rồi merge.',
      '- Đóng pull request mà không merge = bỏ cả đợt; bot không lấy lại các link đã xem.',
      '',
      reportTable(rows),
    ].join('\n'),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
