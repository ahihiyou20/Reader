// CLI: pnpm content:lint — prints issues for published articles and exits 1 if any.
import fs from 'node:fs';
import path from 'node:path';
import { lintArticle } from '../lib/content/lint';

const articlesDir = path.resolve(process.cwd(), 'content/articles');
const files = fs.readdirSync(articlesDir).filter((f) => f.endsWith('.json'));
let hasIssues = false;

for (const file of files) {
  const article = JSON.parse(fs.readFileSync(path.join(articlesDir, file), 'utf8'));
  if (article.status !== 'published') continue;
  const issues = lintArticle(article);
  if (issues.length > 0) {
    hasIssues = true;
    console.error(`${file}:`);
    for (const i of issues) console.error(`  [${i.rule}] ${i.field}: ${i.message}`);
  }
}

if (hasIssues) process.exit(1);
else console.log('content:lint passed: 0 issues');
