// Step 8 (docs/05): decide whether a push needs a Cloudflare build. Drafts saved in the CMS do not;
// code, categories and anything touching a published article do. Also triggers the Unsplash
// download endpoint for covers that are published for the first time (Unsplash API terms).
//   tsx scripts/pipeline/deploy-check.ts <before-sha> <after-sha>
import { execFileSync } from 'node:child_process';
import type { ArticleSource } from '../../lib/content/types';
import { trackUnsplashDownload } from './cover';
import { setOutput } from './lib';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function showJson<T>(sha: string, file: string): T | null {
  try {
    return JSON.parse(git('show', `${sha}:${file}`)) as T;
  } catch {
    return null;
  }
}

async function main() {
  const [before, after = 'HEAD'] = process.argv.slice(2);
  const zero = !before || /^0+$/.test(before);
  const changed = zero ? ['(initial)'] : git('diff', '--name-only', before, after).split('\n').filter(Boolean);
  const reasons: string[] = [];
  for (const f of changed) {
    if (f === '(initial)') reasons.push('first push');
    else if (f.startsWith('content/articles/')) {
      const a = zero ? null : showJson<ArticleSource>(before, f);
      const b = showJson<ArticleSource>(after, f);
      if (a?.status === 'published' || b?.status === 'published') {
        reasons.push(`${f}: published article changed`);
        const loc = b?.cover?.unsplashDownloadLocation;
        if (b?.status === 'published' && loc && (a?.status !== 'published' || a.cover?.url !== b.cover.url)) await trackUnsplashDownload(loc);
      }
    } else if (f === 'content/categories.json' || f === 'content/generated/counts.json') reasons.push(f);
    else if (f.startsWith('content/') || f.startsWith('docs/') || f.startsWith('.github/') || f.endsWith('.md') || f.startsWith('tests/')) continue;
    else reasons.push(`${f}: code`);
  }
  const needed = reasons.length > 0;
  console.log(needed ? `Build needed:\n${reasons.slice(0, 20).join('\n')}` : 'No build needed (only drafts or docs changed).');
  await setOutput('needed', String(needed));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
