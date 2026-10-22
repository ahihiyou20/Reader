import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import { env } from '@/lib/env';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-inter',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: 'Reader — ideas worth a swipe', template: '%s · Reader' },
  description:
    'Short, sourced articles on psychology, science and society. Swipe, read, and turn each idea into a small action. Free, in English and Vietnamese.',
  applicationName: 'Reader',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Reader' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: { type: 'website', siteName: 'Reader', images: ['/icons/og.png'] },
  twitter: { card: 'summary_large_image' },
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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="preload" href="/data/feed.json" as="fetch" crossOrigin="anonymous" />
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
