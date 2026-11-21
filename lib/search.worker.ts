// Search runs here, off the page's thread: the index is 2 MB of JSON, and parsing it on the page held a
// phone's screen still for a good part of a second while the Search panel slid in.
import MiniSearch from 'minisearch';
import { SEARCH_OPTIONS, type SearchDoc } from './search';

let index: Promise<MiniSearch<SearchDoc>> | null = null;
const load = () =>
  (index ??= fetch('/data/search-index.json')
    .then((r) => r.text())
    .then((json) => MiniSearch.loadJSON<SearchDoc>(json, SEARCH_OPTIONS))
    .catch((e) => {
      index = null;
      throw e;
    }));

self.onmessage = async (e: MessageEvent<{ id: number; q: string }>) => {
  const { id, q } = e.data;
  try {
    const ms = await load();
    let res = q ? ms.search(q) : [];
    if (q && !res.length) res = ms.search(q, { combineWith: 'OR' });
    self.postMessage({ id, ids: res.map((r) => String(r.id)) });
  } catch {
    self.postMessage({ id, ids: null });
  }
};
