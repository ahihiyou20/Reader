'use client';
import { QueryClient, useQuery } from '@tanstack/react-query';
import type MiniSearch from 'minisearch';
import type { ArticleClient, Category, FeedFile } from '@/lib/content/types';
import { SEARCH_OPTIONS, type SearchDoc } from '@/lib/search';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, gcTime: 30 * 60_000, retry: 2, refetchOnWindowFocus: false },
  },
});

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

export const fetchFeed = () => getJson<FeedFile>('/data/feed.json');
export const fetchArticle = (slug: string) => getJson<ArticleClient>(`/data/articles/${encodeURIComponent(slug)}.json`);
export const fetchCategories = () => getJson<Category[]>('/data/categories.json');
export const fetchTerms = () => getJson<string[]>('/data/terms.json');

export const articleQuery = (slug: string) => ({ queryKey: ['article', slug], queryFn: () => fetchArticle(slug) });

export function useFeed() {
  return useQuery({ queryKey: ['feed'], queryFn: fetchFeed });
}
export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
}
export function useTerms() {
  return useQuery({ queryKey: ['terms'], queryFn: fetchTerms });
}
export function useArticle(slug: string | undefined, enabled = true) {
  return useQuery({ ...articleQuery(slug ?? ''), enabled: Boolean(slug) && enabled });
}

export function prefetchArticle(slug: string) {
  return queryClient.prefetchQuery(articleQuery(slug));
}

let search: Promise<MiniSearch<SearchDoc>> | null = null;
export function loadSearch(): Promise<MiniSearch<SearchDoc>> {
  if (!search) {
    search = Promise.all([import('minisearch'), fetch('/data/search-index.json').then((r) => r.text())])
      .then(([m, json]) => m.default.loadJSON<SearchDoc>(json, SEARCH_OPTIONS))
      .catch((e) => {
        search = null;
        throw e;
      });
  }
  return search;
}

/** Warm the image cache for a cover so the next article paints instantly (FR-04). */
const warmed = new Set<string>();
export function preloadImage(url: string | undefined) {
  if (!url || warmed.has(url) || typeof window === 'undefined') return;
  warmed.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}
