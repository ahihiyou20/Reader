import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Round 2 starts from the audit branch (PR #15, audit/ponytail). Round 1 used d9a73f2 on main.
const BASE = '00b180d'; // ci: Node 24 actions, pin the e2e runner, run CI on bot pull requests

const violations = [];

function checkAllowedPath(file) {
  const normalized = file.replace(/\\/g, '/');
  if (
    normalized === 'playwright.config.ts' ||
    normalized === 'next.config.ts' ||
    normalized === 'ACCEPTANCE.md' ||
    normalized === 'ARCHITECTURE.md' ||
    normalized === 'AGENTS.md' ||
    normalized === 'COMMIT-SHEET.md' ||
    normalized === 'CINEMA-QA.md' ||
    normalized === 'scripts/covers.mjs' ||
    normalized === '.gitignore' ||
    normalized === 'package.json' ||
    // The user asked for PR previews and merge-to-deploy (2026-11-04).
    normalized === '.github/workflows/ci.yml' ||
    normalized === '.github/workflows/preview.yml' ||
    // Round 2 plan: the bot (triage, structured Gemini output, prose lint, Firecrawl) and its workflows.
    normalized === '.github/workflows/feeds.yml' ||
    normalized === '.github/workflows/import.yml' ||
    normalized === '.github/workflows/issue-article.yml' ||
    // Round 2 plan: the lazy backend entry point and the content lint.
    normalized === 'lib/backend/index.ts' ||
    // PR #15 audit item 8 (user asked to continue it, 2026-11-06): comment and share counters
    // in the Rules and the client writes that match them, plus the CMS script hash.
    normalized === 'firestore.rules' ||
    normalized === 'lib/backend/firebase.ts' ||
    normalized === 'lib/backend/local.ts' ||
    normalized === 'lib/backend/types.ts' ||
    normalized === 'public/cms/index.html' ||
    normalized === 'lib/content/lint.ts' ||
    normalized === 'lib/content/types.ts'
  ) {
    return true;
  }
  // Round 2 plan: content repair and demotion, the pipeline, the feed head, the local server.
  if (
    normalized.startsWith('content/') ||
    normalized.startsWith('scripts/pipeline/') ||
    ['scripts/build-content.ts', 'scripts/build-sw.ts', 'scripts/content-lint.ts', 'scripts/serve.mjs'].includes(normalized)
  ) {
    return true;
  }
  if (
    normalized.startsWith('app/') ||
    normalized.startsWith('components/') ||
    normalized.startsWith('stores/') ||
    normalized.startsWith('messages/') ||
    normalized.startsWith('docs/') ||
    normalized.startsWith('tests/')
  ) {
    return true;
  }
  if (normalized.startsWith('lib/')) {
    if (
      normalized.startsWith('lib/backend/') ||
      normalized.startsWith('lib/content/') ||
      normalized.startsWith('lib/server/')
    ) {
      return false;
    }
    return true;
  }
  return false;
}

// 1. Check changed files
const gitDiffOutput = execSync(`git diff --name-only ${BASE}`, { encoding: 'utf8' });
const untrackedOutput = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' });

const diffFiles = gitDiffOutput.split('\n').map((s) => s.trim()).filter(Boolean);
const untrackedFiles = untrackedOutput.split('\n').map((s) => s.trim()).filter(Boolean);
const allChanged = Array.from(new Set([...diffFiles, ...untrackedFiles]));

for (const file of allChanged) {
  if (!checkAllowedPath(file)) {
    violations.push(`Disallowed changed file: ${file}`);
  }
}

// 2. pnpm-lock.yaml must equal BASE; package.json may differ only in scripts.build, which may only gain
// the conductor-approved cover step (`node scripts/covers.mjs`), and the round 2 `content:lint` script.
try {
  const lockDiff = execSync(`git diff ${BASE} -- pnpm-lock.yaml`, { encoding: 'utf8' });
  if (lockDiff.trim().length > 0) {
    violations.push('pnpm-lock.yaml has changed compared to BASE');
  }
  const basePkg = JSON.parse(execSync(`git show ${BASE}:package.json`, { encoding: 'utf8' }));
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const baseBuild = basePkg.scripts.build;
  const allowedBuild = baseBuild.replace('pnpm content && ', 'pnpm content && node scripts/covers.mjs && ');
  const normalize = (p) =>
    JSON.stringify({ ...p, scripts: { ...p.scripts, build: '', 'content:lint': 'tsx scripts/content-lint.ts' } });
  if (normalize(pkg) !== normalize(basePkg)) {
    violations.push('package.json has changed outside scripts.build compared to BASE');
  }
  if (pkg.scripts.build !== baseBuild && pkg.scripts.build !== allowedBuild) {
    violations.push(`package.json scripts.build may only add the cover step: expected "${allowedBuild}"`);
  }
} catch (e) {
  violations.push(`Failed to compare package files against BASE: ${e.message}`);
}

// 3. Scan added lines in app, components, lib, stores
const bannedPatterns = [
  { name: 'navigator.webdriver', re: /navigator\.webdriver/ },
  { name: 'HeadlessChrome', re: /HeadlessChrome/ },
  { name: 'lighthouse (case-insensitive)', re: /lighthouse/i },
  { name: 'playwright|puppeteer', re: /(?:playwright|puppeteer)/i },
  { name: 'process.env.CI', re: /process\.env\.CI/ },
  { name: "NODE_ENV compared with 'test'", re: /NODE_ENV\s*===?\s*['"]test['"]|['"]test['"]\s*===?\s*NODE_ENV/ },
  { name: 'isTest|__TEST__|__E2E__', re: /\b(isTest|__TEST__|__E2E__)\b/ },
  { name: 'navigator.userAgent|userAgentData', re: /navigator\.(?:userAgent|userAgentData)/ },
  {
    name: 'assignments to getAnimations/animate/requestAnimationFrame/matchMedia/PerformanceObserver',
    re: /(?:(?:window|document|Element\.prototype|HTMLElement\.prototype|Document\.prototype)\s*\.\s*(?:getAnimations|animate|requestAnimationFrame|matchMedia|PerformanceObserver)|(?:getAnimations|animate|requestAnimationFrame|matchMedia|PerformanceObserver))\s*=\s*/,
  },
  {
    name: 'media queries or innerWidth/innerHeight comparisons using test viewports',
    re: /(?:innerWidth|innerHeight|\b(?:min|max)-(?:width|height)\b)[^;\n\r]*\b(390|844|375|667|820|1180|1440|1920|1080|900)\b/,
  },
  { name: '__qa', re: /__qa/ },
  { name: 'data-qa', re: /data-qa/ },
];

const addedLines = [];

try {
  const diffAdded = execSync(`git diff -U0 ${BASE} -- app components lib stores`, { encoding: 'utf8' });
  const lines = diffAdded.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push({ file: 'git-diff', text: line.slice(1) });
    }
  }
} catch (e) {
  violations.push(`Failed to get git diff for code folders: ${e.message}`);
}

for (const file of untrackedFiles) {
  if (
    file.startsWith('app/') ||
    file.startsWith('components/') ||
    file.startsWith('lib/') ||
    file.startsWith('stores/')
  ) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        addedLines.push({ file: `${file}:${i + 1}`, text: lines[i] });
      }
    }
  }
}

for (const { file, text } of addedLines) {
  for (const p of bannedPatterns) {
    if (p.re.test(text)) {
      violations.push(`Prohibited pattern "${p.name}" found in ${file}: ${text.trim()}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Integrity check failed with violations:');
  for (const v of violations) {
    console.error(`- ${v}`);
  }
  process.exit(1);
} else {
  console.log('Integrity check passed: 0 violations');
}
