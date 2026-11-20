import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import { stageScript } from '@/lib/stage';
import { env } from '@/lib/env';
import { SHARE_SIZE, SITE_IMAGE } from '@/lib/share-image';
import './globals.css';
import './styles/stage-compact-landscape.css';
import './styles/stage-regular-portrait.css';
import './styles/stage-regular-landscape.css';
import './styles/pagemoor.css';

// Fonts are kept in the repository (app/fonts: the Google Fonts files cut to Latin and Vietnamese)
// instead of fetched from Google Fonts at build time, which failed the deploy whenever Google answered
// with a font URL next/font did not expect.
const inter = localFont({
  src: './fonts/inter-var.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter',
});

// Cover title faces (lib/title.ts). Not preloaded: a cover needs two of them, and the browser fetches
// only the ones the visible title uses. 'block', not 'swap': a cover title drawn in the fallback serif
// and then redrawn read as a flash of the old design; the files are local and small.
const playfair = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: [
    { path: './fonts/playfair-var.woff2', weight: '400 900', style: 'normal' },
    { path: './fonts/playfair-italic-var.woff2', weight: '400 900', style: 'italic' },
  ],
  variable: '--f-playfair',
});
const vibes = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: './fonts/great-vibes-400.woff2',
  weight: '400',
  variable: '--f-vibes',
});
const yeseva = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: './fonts/yeseva-one-400.woff2',
  weight: '400',
  variable: '--f-yeseva',
});
const pinyon = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: './fonts/pinyon-script-400.woff2',
  weight: '400',
  variable: '--f-pinyon',
});
const anton = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Arial',
  src: './fonts/anton-400.woff2',
  weight: '400',
  variable: '--f-anton',
});
const fraunces = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: './fonts/fraunces-900.woff2',
  weight: '900',
  variable: '--f-fraunces',
});
const allura = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: './fonts/allura-400.woff2',
  weight: '400',
  variable: '--f-allura',
});
const cormorant = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: [
    { path: './fonts/cormorant-garamond-300.woff2', weight: '300', style: 'normal' },
    { path: './fonts/cormorant-garamond-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--f-cormorant',
});
const dancing = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: './fonts/dancing-script-700.woff2',
  weight: '700',
  variable: '--f-dancing',
});
const dela = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Arial',
  src: './fonts/dela-gothic-one-400.woff2',
  weight: '400',
  variable: '--f-dela',
});
const charm = localFont({
  display: 'block',
  preload: false,
  adjustFontFallback: 'Times New Roman',
  src: './fonts/charm-700.woff2',
  weight: '700',
  variable: '--f-charm',
});
const fontVars = [inter, playfair, vibes, yeseva, pinyon, anton, fraunces, allura, cormorant, dancing, dela, charm]
  .map((f) => f.variable)
  .join(' ');

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: 'Pagemoor — ideas worth a swipe', template: '%s · Pagemoor' },
  description:
    'Short, sourced articles on psychology, science and society. Swipe, read, and turn each idea into a small action. Free, in English, Vietnamese, French, German and Spanish.',
  applicationName: 'Pagemoor',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Pagemoor' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Pagemoor',
    title: 'Pagemoor',
    description: 'One good idea a day, read in three minutes. Free, in five languages, with audio.',
    url: '/',
    locale: 'vi_VN',
    alternateLocale: ['en_US', 'fr_FR', 'de_DE', 'es_ES'],
    images: [{ url: SITE_IMAGE, ...SHARE_SIZE, alt: 'Pagemoor — Xin chào' }],
  },
  twitter: { card: 'summary_large_image', title: 'Pagemoor', images: [SITE_IMAGE] },
  ...(env.googleSiteVerification ? { verification: { google: env.googleSiteVerification } } : {}),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#0B0B0F',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: stageScript }} />
        {/* A first visit to the home page opens on the welcome: keep the feed hidden until it mounts,
            or the first article shows for a moment before it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var r=JSON.parse(localStorage.getItem('pagemoor.reading')||'{}');if(location.pathname==='/'&&!(r.state&&r.state.welcomed))document.documentElement.setAttribute('data-welcome','pending')}catch(e){}`,
          }}
        />
        {/* Where the covers live (data/feed.json): almost all on Unsplash, the rest on Cloudinary. */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="preload" href="/data/feed-head.json" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/data/categories.json" as="fetch" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        {env.cfAnalyticsToken && (
          <Script
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: env.cfAnalyticsToken })}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
