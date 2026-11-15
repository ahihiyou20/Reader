// Check articles against the Pagemoor standard (standard.ts).
//   pnpm tsx scripts/pipeline/standard-cli.ts [--claude|--gemini|--expanded] <slug or file>...      exit 1 when one falls short
//   pnpm tsx scripts/pipeline/standard-cli.ts --report [--claude|--gemini|--expanded] <slug or file>...   markdown table, always exit 0
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { dirs, readJson } from './lib';
import { STANDARDS, articleWords, standardProblems } from './standard';

async function main() {
  const args = process.argv.slice(2);
  const report = args.includes('--report');
  const standard = args.includes('--claude') ? STANDARDS.claude : args.includes('--expanded') ? STANDARDS.expanded : STANDARDS.gemini;
  const files = args.filter((x) => !x.startsWith('--')).map((x) => (x.endsWith('.json') ? x : path.join(dirs.articles, `${x}.json`)));
  if (!files.length) return console.log(report ? 'No new articles.' : 'usage: standard-cli.ts [--claude|--expanded] [--report] <slug or file>...');
  const rows = await Promise.all(
    files.map(async (f) => {
      const a = await readJson<ArticleSource>(f);
      return { a, words: articleWords(a), problems: standardProblems(a, standard) };
    }),
  );
  if (report) {
    console.log(`### Pagemoor standard: ${rows.filter((r) => !r.problems.length).length}/${rows.length} articles finished\n`);
    console.log('| Bài | Từ | Còn thiếu |\n|-----|----|-----------|');
    for (const r of rows) console.log(`| ${r.a.slug} | ${r.words} | ${r.problems.join('; ').replace(/\|/g, '/') || '✓'} |`);
    return;
  }
  for (const r of rows) console.log(r.problems.length ? `✗ ${r.a.slug} (${r.words} words)\n${r.problems.map((p) => `    - ${p}`).join('\n')}` : `✓ ${r.a.slug} (${r.words} words)`);
  if (rows.some((r) => r.problems.length)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
