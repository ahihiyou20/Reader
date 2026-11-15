import type { Metadata, Viewport } from 'next';
import { Allura, Anton, Charm, Cormorant_Garamond, Dancing_Script, Dela_Gothic_One, Fraunces, Great_Vibes, Inter, Pinyon_Script, Playfair_Display, Yeseva_One } from 'next/font/google';
import Script from 'next/script';
import { stageScript } from '@/lib/stage';
import { env } from '@/lib/env';
import './globals.css';
import './styles/stage-compact-landscape.css';
import './styles/stage-regular-portrait.css';
import './styles/stage-regular-landscape.css';
import './styles/pagemoor.css';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-inter',
  axes: ['opsz'],
});

// Cover title faces (lib/title.ts). Not preloaded: a cover needs two of them, and the browser fetches
// only the ones the visible title uses.
const playfair = Playfair_Display({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, style: ['normal', 'italic'], variable: '--f-playfair' });
const vibes = Great_Vibes({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '400', variable: '--f-vibes' });
const yeseva = Yeseva_One({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '400', variable: '--f-yeseva' });
const pinyon = Pinyon_Script({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '400', variable: '--f-pinyon' });
const anton = Anton({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '400', variable: '--f-anton' });
const fraunces = Fraunces({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '900', variable: '--f-fraunces' });
const allura = Allura({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '400', variable: '--f-allura' });
const cormorant = Cormorant_Garamond({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: ['300', '600'], variable: '--f-cormorant' });
const dancing = Dancing_Script({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '700', variable: '--f-dancing' });
const dela = Dela_Gothic_One({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '400', variable: '--f-dela' });
const charm = Charm({ subsets: ['latin', 'vietnamese'], display: 'swap', preload: false, weight: '700', variable: '--f-charm' });
const fontVars = [inter, playfair, vibes, yeseva, pinyon, anton, fraunces, allura, cormorant, dancing, dela, charm].map((f) => f.variable).join(' ');

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
  openGraph: { type: 'website', siteName: 'Pagemoor', images: ['/icons/og.png'] },
  twitter: { card: 'summary_large_image' },
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
        <link rel="preconnect" href="https://picsum.photos" />
        <link rel="preconnect" href="https://fastly.picsum.photos" />
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
