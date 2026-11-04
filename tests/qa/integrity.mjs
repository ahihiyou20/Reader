import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = '9195eb664970c73c034deae32d9be8fbbcfa125d';

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
    normalized === '.github/workflows/preview.yml'
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
// the conductor-approved cover step (`node scripts/covers.mjs`).
try {
  const lockDiff = execSync(`git diff ${BASE} -- pnpm-lock.yaml`, { encoding: 'utf8' });
  if (lockDiff.trim().length > 0) {
    violations.push('pnpm-lock.yaml has changed compared to BASE');
  }
  const basePkg = JSON.parse(execSync(`git show ${BASE}:package.json`, { encoding: 'utf8' }));
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const baseBuild = basePkg.scripts.build;
  const allowedBuild = baseBuild.replace('pnpm content && ', 'pnpm content && node scripts/covers.mjs && ');
  const normalize = (p) => JSON.stringify({ ...p, scripts: { ...p.scripts, build: '' } });
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
