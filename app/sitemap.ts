import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { readArticle, readFeed } from '@/lib/server/content';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const feed = readFeed();
  return [
    { url: `${env.siteUrl}/`, lastModified: feed.builtAt, changeFrequency: 'daily', priority: 1 },
    ...feed.items
      .filter((i) => {
        const g = readArticle(i.slug)?.origin.group;
        return g !== 3 && g !== 5;
      })
      .map((i) => ({ url: `${env.siteUrl}/a/${i.slug}`, lastModified: i.publishedAt, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${env.siteUrl}/about`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${env.siteUrl}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${env.siteUrl}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
