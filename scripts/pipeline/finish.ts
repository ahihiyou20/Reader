// Finish new articles once they reach main (workflow finish-articles.yml), whichever writer made them:
// fill the languages and glossaries the writer could not (Gemini, quota permitting), add the motion
// cover the Claude writer's standard asks for (and the Gemini writer's when MOTION_COVERS=true), then
// report each article against the Pagemoor standard.
//   pnpm tsx scripts/pipeline/finish.ts [--report report.md] <slug>...
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { GeminiSetupError, QuotaError, hasGemini } from './gemini';
import { dirs, jobSummary, readJson, writeJson } from './lib';
import { hasFfmpeg, motionCover } from './motion';
import { STANDARDS, articleWords, standardProblems } from './standard';
import { translateAll } from './translate';

const byClaude = (a: ArticleSource) => a.origin.authors.includes('Claude for Reader');

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--report');
  const reportFile = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const slugs = args.map((s) => path.basename(s, '.json'));
  const ffmpeg = await hasFfmpeg();
  let translating = hasGemini();
  const rows: string[] = [];
  for (const slug of slugs) {
    const file = path.join(dirs.articles, `${slug}.json`);
    const a = await readJson<ArticleSource>(file);
    if (a.origin.group !== 4) continue;
    const done: string[] = [];
    if (translating) {
      try {
        const langs = await translateAll(a);
        if (langs.length) done.push(`translated ${langs.join(', ')}`);
      } catch (e) {
        if (e instanceof QuotaError || e instanceof GeminiSetupError) translating = false;
        console.warn(`${slug}: translation stopped (${(e as Error).message.slice(0, 160)})`);
      }
    }
    const wantsMotion = byClaude(a) || process.env.MOTION_COVERS === 'true';
    if (wantsMotion && !a.cover.video && a.cover.provider === 'unsplash' && ffmpeg) {
      try {
        a.cover.video = await motionCover(a);
        done.push('motion cover');
      } catch (e) {
        console.warn(`${slug}: no motion cover (${(e as Error).message.slice(0, 160)})`);
      }
    }
    if (done.length) await writeJson(file, a);
    const problems = standardProblems(a, byClaude(a) ? STANDARDS.claude : STANDARDS.gemini);
    console.log(`${slug}: ${done.join('; ') || 'nothing to add'}${problems.length ? ` — still: ${problems.join('; ')}` : ''}`);
    rows.push(`| ${slug} | ${byClaude(a) ? 'Claude' : 'Gemini'} | ${articleWords(a)} | ${done.join('; ') || '—'} | ${problems.join('; ').replace(/\|/g, '/') || '✓'} |`);
  }
  if (!rows.length) return;
  const report = [`### Hoàn thiện ${rows.length} bài mới`, '', '| Bài | Người viết | Từ | Đã thêm | Còn thiếu |', '|-----|-----------|----|---------|-----------|', ...rows].join('\n');
  await jobSummary(report);
  if (reportFile) await fs.writeFile(reportFile, report + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
