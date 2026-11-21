'use client';
import { FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { useFeed } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import { useReading } from '@/stores/reading';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { usePaged, useT } from '../hooks';
import { ArticleCard, CARD_PAGE } from './ArticleCard';
import { Panel } from './Layer';

const ALL = 'all';
const HISTORY = 'history';

/** Library: every saved article, the reader's own collections, and what they have read. */
export function LibraryPanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('library'));
  const closeOverlay = useUI((s) => s.closeOverlay);
  const openSheet = useUI((s) => s.openSheet);
  const startFeed = useUI((s) => s.startFeed);
  const lang = useUI((s) => s.lang);
  const saves = useUser((s) => s.saves);
  const collections = useReading((s) => s.collections);
  const history = useReading((s) => s.history);
  const { addCollection, renameCollection, removeCollection } = useReading.getState();
  const { data: feed } = useFeed();
  const [tab, setTab] = useState<string>(ALL);
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const [draft, setDraft] = useState('');
  const current = collections.find((c) => c.id === tab);

  const bySlug = useMemo(() => new Map((feed?.items ?? []).map((i) => [i.slug, i])), [feed]);
  const list = useMemo(() => {
    const slugs = tab === HISTORY ? history.map((h) => h.slug) : current ? current.slugs : Object.keys(saves);
    const items = slugs.map((s) => bySlug.get(s)).filter((i): i is FeedItem => !!i);
    // Saved articles keep the feed order (newest first); collections and history keep their own.
    return tab === ALL ? (feed?.items ?? []).filter((i) => saves[i.slug]) : items;
  }, [tab, history, current, saves, bySlug, feed]);
  const seen = useMemo(() => new Map(history.map((h) => [h.slug, h])), [history]);
  const { limit, sentinel, more } = usePaged(list.length, CARD_PAGE, tab);

  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (name) {
      if (naming === 'rename' && current) renameCollection(current.id, name);
      else setTab(addCollection(name));
    }
    setNaming(null);
    setDraft('');
  };

  return (
    <Panel open={open} onClose={() => closeOverlay('library')} label={t('library')} title={t('library')} className="library">
      <div className="pbody">
        <div className="chips scroll" role="toolbar" aria-label={t('library')}>
          {[{ id: ALL, name: t('libAllSaved'), n: Object.keys(saves).length }, ...collections.map((c) => ({ id: c.id, name: c.name, n: c.slugs.length })), { id: HISTORY, name: t('libHistory'), n: history.length }].map(
            (c) => (
              <button key={c.id} className="chip solid" type="button" aria-pressed={tab === c.id} onClick={() => setTab(c.id)}>
                {c.name}
                <span className="chip-n">{c.n}</span>
              </button>
            ),
          )}
          <button
            className="chip"
            type="button"
            onClick={() => {
              setDraft('');
              setNaming('new');
            }}
          >
            <FolderPlus className="ic" aria-hidden="true" />
            {t('libNewCollection')}
          </button>
        </div>

        {naming && (
          <form className="namer" onSubmit={submitName}>
            <input className="input" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} aria-label={t('libCollectionName')} placeholder={t('libCollectionName')} autoFocus />
            <button className="pill" type="submit">
              {t('saveName')}
            </button>
          </form>
        )}

        {current && !naming && (
          <div className="lib-tools">
            <button
              className="pill ghost"
              type="button"
              onClick={() => {
                setDraft(current.name);
                setNaming('rename');
              }}
            >
              <Pencil className="ic" aria-hidden="true" />
              {t('libRename')}
            </button>
            <button
              className="pill ghost"
              type="button"
              onClick={() => {
                removeCollection(current.id);
                setTab(ALL);
              }}
            >
              <Trash2 className="ic" aria-hidden="true" />
              {t('libDelete')}
            </button>
          </div>
        )}

        {list.length ? (
          <div className="grid">
            {list.slice(0, limit).map((i) => (
              <div key={i.slug} className="lib-item">
                <ArticleCard item={i} onOpen={() => startFeed({ category: null, slug: i.slug })} />
                {tab === HISTORY ? (
                  <span className="lib-meta">
                    {seen.get(i.slug)?.done ? `✓ ${t('libFinished')}` : t('libStarted')} · {timeAgo(seen.get(i.slug)?.at ?? 0, lang)}
                  </span>
                ) : (
                  <button className="lib-add" type="button" aria-label={t('libAddTo')} onClick={() => openSheet({ kind: 'collect', slug: i.slug })}>
                    <FolderPlus className="ic" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {more && <div ref={sentinel} aria-hidden="true" />}
          </div>
        ) : (
          <div className="empty-note">{tab === HISTORY ? t('libNoHistory') : current ? t('libEmptyCollection') : t('nothingSaved')}</div>
        )}
      </div>
    </Panel>
  );
}
