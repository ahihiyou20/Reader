import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { readFeed } from '@/lib/server/content';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const feed = readFeed();
  return [
    { url: `${env.siteUrl}/`, lastModified: feed.builtAt, changeFrequency: 'daily', priority: 1 },
    ...feed.items.map((i) => ({ url: `${env.siteUrl}/a/${i.slug}`, lastModified: i.publishedAt, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${env.siteUrl}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${env.siteUrl}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
