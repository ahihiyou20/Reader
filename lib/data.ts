'use client';
// Static JSON (public/data) with a tiny in-memory cache. The files change only on deploy,
// so each one is fetched once per session; failures can be retried.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type MiniSearch from 'minisearch';
import type { ArticleClient, Category, FeedFile } from '@/lib/content/types';
import { SEARCH_OPTIONS, type SearchDoc } from '@/lib/search';

interface Entry<T> {
  status: 'loading' | 'success' | 'error';
  data?: T;
  promise?: Promise<T>;
}
const cache = new Map<string, Entry<unknown>>();
const subs = new Map<string, Set<() => void>>();
const notify = (key: string) => subs.get(key)?.forEach((fn) => fn());

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

function load<T>(key: string, fn: () => Promise<T>, force = false): Promise<T> {
  const cur = cache.get(key) as Entry<T> | undefined;
  if (cur && !force && cur.status !== 'error') return cur.promise ?? Promise.resolve(cur.data as T);
  const promise = fn().then(
    (data) => {
      cache.set(key, { status: 'success', data });
      notify(key);
      return data;
    },
    (e) => {
      cache.set(key, { status: 'error' });
      notify(key);
      throw e;
    },
  );
  cache.set(key, { status: 'loading', promise, data: cur?.data });
  notify(key);
  return promise;
}

export function setData<T>(key: string, data: T) {
  cache.set(key, { status: 'success', data });
  notify(key);
}

function useResource<T>(key: string | null, fn: () => Promise<T>) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      let set = subs.get(key);
      if (!set) subs.set(key, (set = new Set()));
      set.add(cb);
      if (!cache.has(key)) load(key, fn).catch(() => {});
      return () => set!.delete(cb);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) as Entry<T> | undefined) : undefined),
    () => undefined,
  );
  return {
    data: entry?.data,
    isError: entry?.status === 'error',
    isLoading: !entry || entry.status === 'loading',
    refetch: () => (key ? load(key, fn, true).catch(() => undefined) : undefined),
  };
}

export const fetchFeed = () => getJson<FeedFile>('/data/feed.json');
const fetchFeedHead = () => getJson<FeedFile>('/data/feed-head.json');
export const fetchArticle = (slug: string) => getJson<ArticleClient>(`/data/articles/${encodeURIComponent(slug)}.json`);

/**
 * The feed: the small head file first (the first ranked items, preloaded in the HTML), then the full
 * list once the browser is idle. The full list starts with the same items, so nothing on screen moves.
 */
export function useFeed(needSlug?: string | null) {
  const head = useResource('feed-head', fetchFeedHead);
  const [wantFull, setWantFull] = useState(() => cache.get('feed')?.status === 'success');
  const headComplete = head.data !== undefined && (head.data.total ?? head.data.items.length) <= head.data.items.length;
  // A link to an article outside the head needs the full list before anything is shown, or the
  // feed would open on another article and jump.
  const missing = Boolean(needSlug && head.data && !headComplete && !head.data.items.some((i) => i.slug === needSlug));
  useEffect(() => {
    if (wantFull || !head.data || headComplete) return;
    const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(() => setWantFull(true), { timeout: 3000 }) : window.setTimeout(() => setWantFull(true), 1500);
    return () => (idle ? (window as unknown as { cancelIdleCallback: (n: number) => void }).cancelIdleCallback(id) : clearTimeout(id));
  }, [wantFull, head.data, headComplete]);
  const full = useResource(wantFull || missing ? 'feed' : null, fetchFeed);
  if (missing && !full.data) return { ...full, data: undefined };
  return full.data ? full : head;
}
export const useCategories = () => useResource('categories', () => getJson<Category[]>('/data/categories.json'));
export const useTerms = () => useResource('terms', () => getJson<string[]>('/data/terms.json'));
export function useArticle(slug: string | undefined, enabled = true) {
  return useResource(slug && enabled ? `article:${slug}` : null, () => fetchArticle(slug!));
}
export const setArticleData = (a: ArticleClient) => setData(`article:${a.slug}`, a);

export function prefetchArticle(slug: string) {
  return load(`article:${slug}`, () => fetchArticle(slug)).catch(() => undefined);
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

export function decodeImage(src: string): Promise<void> {
  if (typeof window === 'undefined' || !src) return Promise.resolve();
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  if (typeof img.decode === 'function') {
    return img.decode().catch(() => {});
  }
  return new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

