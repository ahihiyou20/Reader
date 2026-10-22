'use client';
// Editors' preview (docs/05 step 6): reads the draft straight from GitHub (public repo, no build),
// runs the same checks as the validate workflow and shows the article with the real components.
import { useCallback, useEffect, useState } from 'react';
import { ReaderApp, type PreviewData } from '@/components/ReaderApp';
import { toClient, toFeedItem } from '@/lib/content/transform';
import type { ArticleSource, CoverSource } from '@/lib/content/types';
import { validateArticle, type Issue } from '@/lib/content/validate';
import { env } from '@/lib/env';
import { detectLang, translate } from '@/lib/i18n';

type State =
  | { kind: 'loading' }
  | { kind: 'missing'; slug: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: PreviewData; issues: Issue[]; candidates: CoverSource[]; source: ArticleSource };

export function PreviewClient() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [slug, setSlug] = useState('');
  const [panel, setPanel] = useState(false);
  const [lang] = useState(() => (typeof window === 'undefined' ? 'en' : detectLang()));
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(lang, k, v);

  const load = useCallback(async (s: string, cover?: CoverSource) => {
    setState({ kind: 'loading' });
    const params = new URLSearchParams(location.search);
    const local = params.get('source') === 'local' || location.hostname === 'localhost';
    const url = local
      ? `/__content/articles/${s}.json`
      : `https://raw.githubusercontent.com/${env.repo}/${params.get('ref') ?? env.repoBranch}/content/articles/${encodeURIComponent(s)}.json?t=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.status === 404) return setState({ kind: 'missing', slug: s });
      if (!res.ok) throw new Error(`${res.status}`);
      const raw = (await res.json()) as ArticleSource;
      const src = cover ? { ...raw, cover } : raw;
      const result = validateArticle(src);
      const article = toClient(src);
      setState({
        kind: 'ready',
        data: { article, item: toFeedItem(article) },
        issues: result.issues,
        candidates: raw.coverCandidates ?? [],
        source: src,
      });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    const s = new URLSearchParams(location.search).get('slug') ?? '';
    setSlug(s);
    if (s) load(s);
    else setState({ kind: 'missing', slug: '' });
  }, [load]);

  const errors = state.kind === 'ready' ? state.issues.filter((i) => i.level === 'error').length : 0;
  return (
    <>
      {state.kind === 'ready' ? (
        <ReaderApp key={state.data.article.cover.url} preview={state.data}>
          <PreviewBar
            label={`${t('previewBanner')} · ${state.source.status}${errors ? ` · ${errors} ✗` : ''}`}
            onReload={() => load(slug)}
            onIssues={() => setPanel(true)}
            issuesLabel={`${t('previewIssues')} (${state.issues.length})`}
            reloadLabel={t('reload')}
          />
          {panel && (
            <div className="panel" style={{ zIndex: 90 }} role="dialog" aria-label={t('previewIssues')}>
              <div className="phead">
                <h2>{t('previewIssues')}</h2>
                <button className="pill" type="button" onClick={() => setPanel(false)}>
                  {t('close')}
                </button>
              </div>
              <div className="pbody">
                <ul className="issues">
                  {state.issues.length === 0 && <li>✓</li>}
                  {state.issues.map((i, k) => (
                    <li key={k} className={i.level}>
                      <span className="lv">{i.level}</span>
                      <b>{i.field}</b> — {i.message}
                    </li>
                  ))}
                </ul>
                {state.candidates.length > 0 && (
                  <>
                    <div className="label">Cover candidates</div>
                    <div className="cands">
                      {state.candidates.map((c) => (
                        <button
                          key={c.url}
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(c.url).catch(() => {});
                            setPanel(false);
                            load(slug, c);
                          }}
                          title={`${c.author} · ${c.license}`}
                        >
                          <img src={c.type === 'video' ? c.poster ?? c.url : c.url} alt="" loading="lazy" />
                          <span>{c.author}</span>
                        </button>
                      ))}
                    </div>
                    <p className="fine" style={{ textAlign: 'left' }}>
                      Tap a candidate to preview it; its URL is copied so you can paste it into the CMS form.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </ReaderApp>
      ) : (
        <div className="app">
          <div className="splash">
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--fg2)', font: '500 15px/22px var(--font-sans)' }}>
              {state.kind === 'loading' && t('previewLoading')}
              {state.kind === 'missing' && t('previewMissing', { slug: state.slug })}
              {state.kind === 'error' && `${t('loadError')} (${state.message})`}
              {state.kind !== 'loading' && slug && (
                <div style={{ marginTop: 14 }}>
                  <button className="pill" type="button" onClick={() => load(slug)}>
                    {t('reload')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PreviewBar(p: { label: string; onReload: () => void; onIssues: () => void; issuesLabel: string; reloadLabel: string }) {
  return (
    <div className="pbar" role="status">
      <span className="grow">{p.label}</span>
      <button type="button" onClick={p.onIssues}>
        {p.issuesLabel}
      </button>
      <button type="button" onClick={p.onReload}>
        {p.reloadLabel}
      </button>
    </div>
  );
}
