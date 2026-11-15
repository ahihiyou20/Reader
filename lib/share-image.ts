// Link previews (Open Graph, Twitter, Discord, Messenger, Zalo): every shared page gets a 1200×630 JPEG.
// Unsplash covers are cropped to that size by Unsplash's CDN; covers kept in the repo get a file made
// at build time by scripts/og.mjs; anything else falls back to the Pagemoor card.

export const SHARE_SIZE = { width: 1200, height: 630 };
export const SITE_IMAGE = '/icons/og-pagemoor.jpg';

export function shareImage(a: { slug: string; cover: { type: 'image' | 'video'; url: string; poster?: string; wide?: string } }): string {
  const src = a.cover.wide ?? (a.cover.type === 'video' ? a.cover.poster : a.cover.url);
  if (src?.startsWith('https://images.unsplash.com/')) {
    const u = new URL(src);
    u.searchParams.set('w', '1200');
    u.searchParams.set('h', '630');
    u.searchParams.set('fit', 'crop');
    u.searchParams.set('q', '80');
    // Some messengers still cannot show WebP.
    u.searchParams.set('fm', 'jpg');
    return u.toString();
  }
  if (src?.startsWith('/')) return `/og/${a.slug}.jpg`;
  return SITE_IMAGE;
}
