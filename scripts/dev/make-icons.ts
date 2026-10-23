// Generates the PWA icons and the default share image from one SVG mark. Run: pnpm tsx scripts/dev/make-icons.ts
import fs from 'node:fs/promises';
import sharp from 'sharp';

const mark = (size: number, pad: number, radius: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF3D8B"/><stop offset=".55" stop-color="#8B5CF6"/><stop offset="1" stop-color="#60A5FA"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="#0B0B0F"/>
  <rect x="${pad}" y="${pad}" width="${size - 2 * pad}" height="${size - 2 * pad}" rx="${radius * 0.8}" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, Helvetica, sans-serif"
        font-weight="800" font-size="${(size - 2 * pad) * 0.56}" fill="#fff" letter-spacing="-2">R</text>
</svg>`;

async function main() {
  await fs.mkdir('public/icons', { recursive: true });
  await fs.writeFile('public/icons/favicon.svg', mark(64, 0, 16));
  await sharp(Buffer.from(mark(512, 0, 112))).png().toFile('public/icons/icon-512.png');
  await sharp(Buffer.from(mark(192, 0, 42))).png().toFile('public/icons/icon-192.png');
  await sharp(Buffer.from(mark(512, 70, 0))).png().toFile('public/icons/maskable-512.png');
  await sharp(Buffer.from(mark(180, 0, 0))).png().toFile('public/icons/apple-touch-icon.png');
  // Google OAuth consent screen logo: square 120×120 PNG, no transparency.
  await sharp(Buffer.from(mark(120, 0, 0))).flatten({ background: '#0B0B0F' }).png().toFile('public/icons/logo-120.png');
  const og = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><radialGradient id="r" cx=".3" cy=".3" r=".9"><stop offset="0" stop-color="#3b1640"/><stop offset="1" stop-color="#0B0B0F"/></radialGradient>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF3D8B"/><stop offset=".55" stop-color="#8B5CF6"/><stop offset="1" stop-color="#60A5FA"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#r)"/>
  <rect x="96" y="215" width="200" height="200" rx="46" fill="url(#g)"/>
  <text x="196" y="322" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="120" fill="#fff">R</text>
  <text x="350" y="300" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="84" fill="#fff" letter-spacing="-2">Reader</text>
  <text x="352" y="372" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="34" fill="rgba(255,255,255,.75)">Ideas worth a swipe · Ý tưởng đáng để lướt</text>
</svg>`;
  await sharp(Buffer.from(og)).png().toFile('public/icons/og.png');
  console.log('icons written');
}
main();
