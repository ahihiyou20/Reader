// Build-time helpers for server components (static export): read the generated public/data files.
import fs from 'node:fs';
import path from 'node:path';
import type { ArticleClient, FeedFile } from '@/lib/content/types';

const DATA = path.join(process.cwd(), 'public', 'data');

export function readFeed(): FeedFile {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, 'feed.json'), 'utf8')) as FeedFile;
  } catch {
    return { builtAt: new Date().toISOString(), items: [] };
  }
}

export function readArticle(slug: string): ArticleClient | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, 'articles', `${slug}.json`), 'utf8')) as ArticleClient;
  } catch {
    return null;
  }
}
