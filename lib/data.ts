'use client';
// Static JSON (public/data) with a tiny in-memory cache. The files change only on deploy,
// so each one is fetched once per session; failures can be retried.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { ArticleClient, Category, FeedFile } from '@/lib/content/types';

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
 * True once the page's own files have loaded (the first cover, its title faces, the code). Prefetches
 * wait for it: started earlier, they took a phone's bandwidth from the first cover and doubled its wait.
 */
export function usePageLoaded() {
  // Starts false even when the page has loaded already: the server's render must match the first one.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded) return;
    const on = () => setLoaded(true);
    if (document.readyState === 'complete') on();
    else window.addEventListener('load', on, { once: true });
    return () => window.removeEventListener('load', on);
  }, [loaded]);
  return loaded;
}

/**
 * The feed: the small head file first (the first ranked items, preloaded in the HTML), then the full
 * list once the browser is idle. The full list starts with the same items, so nothing on screen moves.
 */
export function useFeed(needSlug?: string | null) {
  const head = useResource('feed-head', fetchFeedHead);
  const [wantFull, setWantFull] = useState(() => cache.get('feed')?.status === 'success');
  const loaded = usePageLoaded();
  const headComplete = head.data !== undefined && (head.data.total ?? head.data.items.length) <= head.data.items.length;
  // A link to an article outside the head needs the full list before anything is shown, or the
  // feed would open on another article and jump.
  const missing = Boolean(needSlug && head.data && !headComplete && !head.data.items.some((i) => i.slug === needSlug));
  useEffect(() => {
    if (wantFull || !head.data || headComplete || !loaded) return;
    const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(() => setWantFull(true), { timeout: 3000 }) : window.setTimeout(() => setWantFull(true), 1500);
    return () => (idle ? (window as unknown as { cancelIdleCallback: (n: number) => void }).cancelIdleCallback(id) : clearTimeout(id));
  }, [wantFull, head.data, headComplete, loaded]);
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

let worker: Worker | null = null;
let asked = 0;
const waiting = new Map<number, (ids: string[] | null) => void>();
/**
 * Slugs matching `q`, best first; an empty query only loads the index. Rejects when the index cannot be
 * loaded (offline). The search itself runs in lib/search.worker.ts.
 */
export function searchSlugs(q: string): Promise<string[]> {
  if (!worker) {
    worker = new Worker(new URL('./search.worker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<{ id: number; ids: string[] | null }>) => {
      waiting.get(e.data.id)?.(e.data.ids);
      waiting.delete(e.data.id);
    };
  }
  const id = ++asked;
  worker.postMessage({ id, q });
  return new Promise((resolve, reject) => waiting.set(id, (ids) => (ids ? resolve(ids) : reject(new Error('search index')))));
}

/** Covers already fetched and decoded: CoverMedia shows these at once, without the fade-in. */
const decoded = new Set<string>();
export const isDecoded = (url: string | undefined) => Boolean(url && decoded.has(url));

export interface ImageJob {
  src: string | undefined;
  srcSet?: string;
  sizes?: string;
}

// Every image fetched ahead of need goes through one queue, two at a time, so they arrive in the order
// the reader will reach them. Fired all at once they shared a phone's bandwidth, and every cover stayed
// blurred until the last one landed. Covers near the one on screen go first, card pictures after them.
const started = new Set<string>();
const queues: [ImageJob[], ImageJob[]] = [[], []];
let running = 0;

function pump() {
  while (running < 2) {
    const job = queues[0].shift() ?? queues[1].shift();
    if (!job) return;
    const src = job.src!;
    if (started.has(src)) continue;
    started.add(src);
    running++;
    const img = new Image();
    img.decoding = 'async';
    if (job.srcSet) {
      img.sizes = job.sizes ?? '';
      img.srcset = job.srcSet;
    }
    img.src = src;
    img
      .decode()
      .then(() => decoded.add(src))
      .catch(() => started.delete(src))
      .finally(() => {
        running--;
        pump();
      });
  }
}

/**
 * Fetch and decode images with the same src/srcset/sizes their <img> will use, so the browser picks the
 * same file. Covers (the default) replace the covers still waiting: the reader has moved, and the old
 * neighbours matter less than the new ones. Cards (`cards`) wait behind every cover.
 */
export function preloadImages(jobs: ImageJob[], cards = false) {
  if (typeof window === 'undefined') return;
  const queue = queues[cards ? 1 : 0];
  if (!cards) queue.length = 0;
  for (const job of jobs) if (job.src && !started.has(job.src)) queue.push(job);
  pump();
}
