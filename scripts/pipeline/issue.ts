// Quick upload (docs/05 §9): turn an "Add article" issue form (.github/ISSUE_TEMPLATE/add-article.yml)
// into an article. The workflow passes the issue body in ISSUE_BODY and opens the pull request.
//   ISSUE_BODY=… pnpm tsx scripts/pipeline/issue.ts --report report.md
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Category } from '../../lib/content/types';
import { type CreateInput, type Mode, AUTO, createArticle } from './create';
import { reportTable } from './feeds';
import { CONTENT, readJson, setOutput } from './lib';

/** GitHub renders issue forms as "### <label>\n\n<value>"; empty answers are "_No response_". */
export function parseIssueForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = body.replace(/\r\n/g, '\n').split(/^### +/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const label = (nl < 0 ? part : part.slice(0, nl)).trim();
    const value = (nl < 0 ? '' : part.slice(nl + 1)).trim();
    out[label] = value === '_No response_' ? '' : value;
  }
  return out;
}

const MODES: Array<[RegExp, Mode]> = [
  [/^phỏng theo|^adapt/i, 'adapt'],
  [/^nguyên văn|^verbatim/i, 'verbatim'],
  [/^tóm tắt|^summary/i, 'summary'],
];

export function inputFromForm(form: Record<string, string>, categories: Category[]): CreateInput {
  const field = (re: RegExp) => Object.entries(form).find(([k]) => re.test(k))?.[1]?.trim() ?? '';
  const url = field(/^link/i).match(/https?:\/\/\S+/)?.[0];
  const text = field(/nội dung|text/i);
  const title = field(/^tiêu đề|^title/i) || undefined;
  const cat = field(/^chủ đề|^category/i).toLowerCase();
  const category =
    categories.find((c) => cat.startsWith(c.id) || cat.startsWith(c.name.en.toLowerCase()) || (c.name.vi && cat.includes(c.name.vi.toLowerCase())))?.id ?? AUTO;
  const modeText = field(/^cách đăng|^mode/i);
  const mode = MODES.find(([re]) => re.test(modeText))?.[1] ?? 'auto';
  return { url, text: url ? undefined : text, title, category, mode };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--report');
  const reportFile = i >= 0 ? args[i + 1] : undefined;
  const categories = await readJson<Category[]>(path.join(CONTENT, 'categories.json'));
  const input = inputFromForm(parseIssueForm(process.env.ISSUE_BODY ?? ''), categories);
  let report: string;
  try {
    if (!input.url && !input.text) throw new Error('Form has neither a link nor text.');
    const c = await createArticle(input);
    await setOutput('ok', 'true');
    await setOutput('slug', c.slug);
    report = `Bot đã tạo bài **${c.title}**.\n\n${reportTable([c])}\n\nMở preview để đọc; merge pull request để đăng bài.`;
  } catch (e) {
    await setOutput('ok', 'false');
    report = `Bot chưa tạo được bài:\n\n> ${(e as Error).message.replace(/\n/g, ' ')}\n\nSửa nội dung issue rồi đóng và mở lại issue để thử lại.`;
  }
  console.log(report);
  if (reportFile) await fs.writeFile(reportFile, report + '\n');
}

if (process.argv[1]?.endsWith('issue.ts'))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
