'use client';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { loadSearch, useFeed, useTerms } from '@/lib/data';
import { track } from '@/lib/analytics';
import { pick } from '@/lib/i18n';
import { markMatches } from '@/lib/search';
import { useUI } from '@/stores/ui';
import { useCategoryName } from '../feed/CoverView';
import { useDebounced, useT } from '../hooks';
import { coverThumb } from './ArticleCard';
import { Panel } from './Layer';

const RECENT = 'reader.recent';
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? '[]');
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT, JSON.stringify(list.slice(0, 10)));
  } catch {}
}

/** SCR-05 Search (FR-23): accent-insensitive, 250 ms debounce, recent searches kept on this device. */
export function SearchPanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('search'));
  const closeOverlay = useUI((s) => s.closeOverlay);
  const startFeed = useUI((s) => s.startFeed);
  const { data: feed } = useFeed();
  const { data: terms } = useTerms();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const [recent, setRecent] = useState<string[]>([]);
  const [hits, setHits] = useState<FeedItem[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const bySlug = useMemo(() => new Map((feed?.items ?? []).map((i) => [i.slug, i])), [feed]);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    loadSearch().catch(() => {});
    const id = setTimeout(() => input.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!dq) {
      setHits(null);
      return;
    }
    let cancelled = false;
    loadSearch()
      .then((ms) => {
        if (cancelled) return;
        let res = ms.search(dq);
        if (!res.length) res = ms.search(dq, { combineWith: 'OR' });
        setHits(res.map((r) => bySlug.get(String(r.id))).filter(Boolean) as FeedItem[]);
      })
      .catch(() => setHits([]));
    return () => {
      cancelled = true;
    };
  }, [dq, bySlug]);

  const remember = (term: string) => {
    const v = term.trim();
    if (!v) return;
    const next = [v, ...readRecent().filter((x) => x.toLowerCase() !== v.toLowerCase())];
    writeRecent(next);
    setRecent(next.slice(0, 10));
    track('search', { q: v.slice(0, 40) });
  };
  const openItem = (i: FeedItem) => {
    remember(q);
    setQ('');
    startFeed({ category: null, slug: i.slug });
  };

  return (
    <Panel
      open={open}
      onClose={() => closeOverlay('search')}
      label={t('search')}
      closeIcon="none"
      header={
        <>
          <form
            className="searchbox"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              remember(q);
              input.current?.blur();
            }}
          >
            <Search className="ic" aria-hidden="true" />
            <input
              ref={input}
              className="sinput"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('searchPh')}
              aria-label={t('searchPh')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button className="clear" type="button" aria-label={t('close')} onClick={() => (setQ(''), input.current?.focus())}>
                <X className="ic" aria-hidden="true" />
              </button>
            )}
          </form>
          <button className="cancel" type="button" onClick={() => closeOverlay('search')}>
            {t('cancel')}
          </button>
        </>
      }
    >
      <div className="pbody">
        {!dq && (
          <>
            {recent.length > 0 && (
              <>
                <div className="label" style={{ display: 'flex' }}>
                  {t('recent')}
                  <button
                    type="button"
                    style={{ marginLeft: 'auto', color: 'var(--fg3)', font: 'inherit' }}
                    onClick={() => {
                      writeRecent([]);
                      setRecent([]);
                    }}
                  >
                    {t('clearRecent')}
                  </button>
                </div>
                <div className="chips">
                  {recent.map((r) => (
                    <span key={r} className="chip" style={{ paddingRight: 4 }}>
                      <button type="button" onClick={() => setQ(r)}>
                        {r}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t('delete')} ${r}`}
                        style={{ display: 'grid', placeItems: 'center', width: 28, height: 28 }}
                        onClick={() => {
                          const next = readRecent().filter((x) => x !== r);
                          writeRecent(next);
                          setRecent(next);
                        }}
                      >
                        <X className="x" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              </>
            )}
            {terms && terms.length > 0 && (
              <>
                <div className="label">{t('popular')}</div>
                <div className="chips">
                  {terms.map((term) => (
                    <button key={term} className="chip term" type="button" onClick={() => setQ(term)}>
                      {term}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {dq && hits && (
          <div aria-live="polite">
            {hits.length ? (
              <>
                <div className="label">{t('results', { n: hits.length })}</div>
                <div className="rlist">
                  {hits.map((i) => (
                    <ResultItem key={i.slug} item={i} q={dq} onOpen={() => openItem(i)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="rnone">{t('noResults', { q: dq })}</div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function ResultItem({ item, q, onOpen }: { item: FeedItem; q: string; onOpen: () => void }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const cat = useCategoryName(item.category);
  const title = pick(item.title, lang) ?? '';
  return (
    <button className="ritem" type="button" onClick={onOpen}>
      <span className="thumb" style={{ ['--dominant' as string]: item.cover.dominant }}>
        <img src={coverThumb(item)} alt="" loading="lazy" decoding="async" />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="rtitle">
          {markMatches(title, q).map((p, i) => (p.hit ? <mark key={i}>{p.v}</mark> : <span key={i}>{p.v}</span>))}
        </span>
        <span className="rmeta" style={{ display: 'block' }}>
          {cat} · {t('minRead', { n: item.readingMinutes })}
        </span>
      </span>
    </button>
  );
}
