// Check article files against the house writing rules (the daily Claude writer runs this before pushing).
//   pnpm tsx scripts/pipeline/prose-lint-cli.ts content/articles/<slug>.json [...]
import fs from 'node:fs/promises';
import type { ArticleSource } from '../../lib/content/types';
import { lintProse, plainFieldsOf, proseFields } from './prose-lint';

async function main() {
  let failed = 0;
  for (const file of process.argv.slice(2)) {
    const a = JSON.parse(await fs.readFile(file, 'utf8')) as ArticleSource;
    for (const lang of ['en', 'vi'] as const) {
      const fields = proseFields(a, lang);
      for (const f of lintProse(fields, lang, { plainFields: plainFieldsOf(fields) })) {
        failed++;
        console.log(`${file} ${f.field}: ${f.rule} “${f.text}”`);
      }
    }
  }
  if (failed) process.exit(1);
  console.log('Prose check passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
