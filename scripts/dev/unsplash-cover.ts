// Gives an article an Unsplash cover served from Unsplash's CDN, portrait for phones and landscape for
// wide screens, with the photographer credited and linked as the API guidelines ask. The download is
// reported to Unsplash when the article is deployed (scripts/pipeline/deploy-check.ts).
//   pnpm tsx scripts/dev/unsplash-cover.ts --search "<words>"           list unused photos (needs UNSPLASH_ACCESS_KEY)
//   pnpm tsx scripts/dev/unsplash-cover.ts <slug> <photo-url-or-id>     with UNSPLASH_ACCESS_KEY
//   pnpm tsx scripts/dev/unsplash-cover.ts <slug> <photo-url-or-id> --raw <images.unsplash.com URL> --author "<name>" --username <handle>
// The last form needs no key: take the image URL (og:image), name and @handle from the photo's page.
import path from 'node:path';
import type { ArticleSource, CoverSource } from '../../lib/content/types';
import { remotePlaceholder } from '../pipeline/cover';
import { PORTRAIT, UTM, WIDE, cdn, unsplashId } from '../pipeline/host-covers';
import { dirs, listJson, readJson, writeJson } from '../pipeline/lib';

const api = (p: string) =>
  fetch(`https://api.unsplash.com${p}`, { headers: { authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, 'accept-version': 'v1' }, signal: AbortSignal.timeout(30_000) });

async function inUse(except?: string): Promise<Map<string, string>> {
  const used = new Map<string, string>();
  for (const f of await listJson(dirs.articles)) {
    const a = await readJson<ArticleSource>(path.join(dirs.articles, f));
    const id = unsplashId(a.cover.sourceUrl);
    if (id && a.slug !== except) used.set(id, a.slug);
  }
  return used;
}

async function search(query: string) {
  if (!process.env.UNSPLASH_ACCESS_KEY) throw new Error('--search needs UNSPLASH_ACCESS_KEY');
  const res = await api(`/search/photos?${new URLSearchParams({ query, orientation: 'portrait', per_page: '20', content_filter: 'high' })}`);
  if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);
  const used = await inUse();
  const { results } = (await res.json()) as { results: Array<{ id: string; likes: number; alt_description?: string; user: { name: string } }> };
  for (const p of results.filter((r) => !used.has(r.id))) console.log(`${p.id}\t${p.likes} likes\t${p.user.name}\t${p.alt_description ?? ''}`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const query = opt('search');
  if (query) return search(query);
  let raw = opt('raw');
  let author = opt('author');
  let username = opt('username')?.replace(/^@/, '');
  const [slug, photo] = args;
  const id = photo && (unsplashId(photo.startsWith('http') ? photo : `https://unsplash.com/photos/${photo}`) ?? photo);
  if (!slug || !id) throw new Error('usage: unsplash-cover.ts <slug> <photo-url-or-id> [--raw <url> --author <name> --username <handle>]');
  const taken = (await inUse(slug)).get(id);
  if (taken) throw new Error(`Photo ${id} is already the cover of ${taken}: pick another`);
  if (process.env.UNSPLASH_ACCESS_KEY) {
    const res = await api(`/photos/${id}`);
    if (!res.ok) throw new Error(`Unsplash HTTP ${res.status} for ${id}`);
    const p = (await res.json()) as { urls: { raw: string }; user: { name: string; username: string } };
    raw = p.urls.raw;
    author = p.user.name;
    username = p.user.username;
  }
  if (!raw?.startsWith('https://images.unsplash.com/') || !author || !username)
    throw new Error('Without UNSPLASH_ACCESS_KEY give --raw (an https://images.unsplash.com/ URL), --author and --username from the photo page');
  // The page's og:image carries its own size parameters: start from the bare image.
  const base = raw.replace(/[?&](w|h|fit|crop|q|fm|auto|dpr|cs)=[^&]*/g, '').replace(/\?&/, '?').replace(/[?&]$/, '');
  const file = path.join(dirs.articles, `${slug}.json`);
  const a = await readJson<ArticleSource>(file);
  const cover: CoverSource = {
    type: 'image',
    url: cdn(base, PORTRAIT),
    wide: cdn(base, WIDE),
    provider: 'unsplash',
    author,
    authorUrl: `https://unsplash.com/@${username}?${UTM}`,
    license: 'Unsplash License',
    sourceUrl: `https://unsplash.com/photos/${id}`,
    unsplashDownloadLocation: `https://api.unsplash.com/photos/${id}/download`,
  };
  a.cover = cover;
  delete a.coverCandidates;
  Object.assign(a, await remotePlaceholder(cover));
  await writeJson(file, a);
  console.log(`${slug}: ${author} (unsplash.com/photos/${id})${a.dominant ? ` ${a.dominant}` : ''}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
