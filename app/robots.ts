import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/preview', '/cms', '/__/'] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
