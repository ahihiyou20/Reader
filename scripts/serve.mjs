// Minimal static server for the exported site with Cloudflare Pages-style clean URLs
// (/a/slug → /a/slug.html), brotli/gzip and the cache headers from public/_headers, so local
// Lighthouse runs measure what the CDN serves. Used by `pnpm start` and the Playwright tests.
//   node scripts/serve.mjs [dir=out]   (PORT defaults to 4173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const root = normalize(join(process.cwd(), process.argv[2] ?? 'out'));
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.yml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const compressible = /^(text\/|application\/(json|manifest|xml)|image\/svg)/;

// shortcut: only path-prefix rules with headers are read from _headers (the format Cloudflare uses here).
async function loadHeaderRules() {
  const rules = [];
  const text = await readFile(join(root, '_headers'), 'utf8').catch(() => '');
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push({ prefix: line.trim().replace(/\*$/, ''), headers: {} });
    else if (rules.length) {
      const i = line.indexOf(':');
      rules.at(-1).headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}
const headerRules = await loadHeaderRules();
const headersFor = (pathname) =>
  Object.assign({}, ...headerRules.filter((r) => pathname.startsWith(r.prefix)).map((r) => r.headers));

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function resolve(path) {
  for (const candidate of [path, `${path}.html`, join(path, 'index.html')]) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

const packed = new Map(); // `${file}:${encoding}` → compressed body; files only change on rebuild
function encode(file, body, accept) {
  const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
  if (!enc) return { body };
  const key = `${file}:${enc}`;
  if (!packed.has(key)) {
    packed.set(
      key,
      enc === 'br'
        ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
        : gzipSync(body, { level: 6 }),
    );
  }
  return { body: packed.get(key), enc };
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const path = normalize(join(root, decodeURIComponent(pathname)));
  if (path !== root && !path.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  const file = await resolve(path);
  const target = file ?? join(root, '404.html');
  try {
    const raw = await readFile(target);
    const type = types[extname(target)] ?? 'application/octet-stream';
    const headers = { ...headersFor(pathname), 'content-type': type, vary: 'accept-encoding' };
    const out = compressible.test(type) ? encode(target, raw, String(req.headers['accept-encoding'] ?? '')) : { body: raw };
    if (out.enc) headers['content-encoding'] = out.enc;
    headers['content-length'] = out.body.length;
    res.writeHead(file ? 200 : 404, headers);
    res.end(req.method === 'HEAD' ? undefined : out.body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}`));
