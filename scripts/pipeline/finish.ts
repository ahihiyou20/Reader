// Finish new articles once they reach main (workflow finish-articles.yml), whichever writer made them:
// fill the languages and glossaries the writer could not (Gemini, quota permitting), cut the Pixabay
// clip a writer queued in `coverClip`, find one where the Claude writer's standard asks for a motion
// cover (and the Gemini writer's when MOTION_COVERS=true), then report each article against the
// Pagemoor standard.
// With CLOUDINARY_URL set it first moves any clip still kept in public/covers/video/ to Cloudinary.
//   pnpm tsx scripts/pipeline/finish.ts [--report report.md] [<slug>...]
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { GeminiSetupError, QuotaError, hasGemini } from './gemini';
import { dirs, jobSummary, readJson, writeJson } from './lib';
import { autoMotion, hasFfmpeg, hasPixabay, moveClipsOffRepo } from './motion';
import { STANDARDS, articleWords, standardProblems } from './standard';
import { translateAll } from './translate';

const byClaude = (a: ArticleSource) => a.origin.authors.includes('Claude for Reader');

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--report');
  const reportFile = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const slugs = args.map((s) => path.basename(s, '.json'));
  const moved = await moveClipsOffRepo();
  if (moved.length) console.log(`Moved the motion covers of ${moved.length} articles to Cloudinary: ${moved.join(', ')}`);
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
    // A clip the writer chose (coverClip) always; a search on the article's tags where the standard asks for one.
    const wantsMotion = Boolean(a.coverClip) || byClaude(a) || process.env.MOTION_COVERS === 'true';
    if (wantsMotion && !a.cover.video && ffmpeg && hasPixabay()) {
      try {
        const video = await autoMotion(a, [...(a.tags ?? []).slice(0, 3), a.title.en.split(/[:–—]/)[0]]);
        if (video) {
          a.cover.video = video;
          delete a.coverClip;
          done.push('motion cover (Pixabay)');
        }
      } catch (e) {
        console.warn(`${slug}: no motion cover (${(e as Error).message.slice(0, 160)})`);
      }
    }
    if (done.length) await writeJson(file, a);
    const problems = standardProblems(a, byClaude(a) ? STANDARDS.claude : STANDARDS.gemini);
    console.log(`${slug}: ${done.join('; ') || 'nothing to add'}${problems.length ? ` — still: ${problems.join('; ')}` : ''}`);
    rows.push(`| ${slug} | ${byClaude(a) ? 'Claude' : 'Gemini'} | ${articleWords(a)} | ${done.join('; ') || '—'} | ${problems.join('; ').replace(/\|/g, '/') || '✓'} |`);
  }
  if (moved.length) await jobSummary(`Chuyển bìa động của ${moved.length} bài lên Cloudinary: ${moved.join(', ')}`);
  if (!rows.length) return;
  const report = [`### Hoàn thiện ${rows.length} bài mới`, '', '| Bài | Người viết | Từ | Đã thêm | Còn thiếu |', '|-----|-----------|----|---------|-----------|', ...rows].join('\n');
  await jobSummary(report);
  if (reportFile) await fs.writeFile(reportFile, report + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
