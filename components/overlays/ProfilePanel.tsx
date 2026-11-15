'use client';
import { Pencil, Settings, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadSubmissions, updateDisplayName } from '@/lib/actions';
import { pick } from '@/lib/i18n';
import { affinity } from '@/lib/recommend';
import { useReading } from '@/stores/reading';
import { useCategories, useFeed } from '@/lib/data';
import { displayStreak, lastNDays, localDate } from '@/lib/streak';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { Avatar } from '../chrome/Avatar';
import { useT } from '../hooks';
import { ArticleCard } from './ArticleCard';
import { Panel } from './Layer';
import { LOCALE } from '@/lib/content/types';

type Tab = 'saved' | 'liked' | 'posts';

/** SCR-07 Profile: stats, last 7 days, Saved / Liked / My posts, language, account. */
export function ProfilePanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('profile'));
  const closeOverlay = useUI((s) => s.closeOverlay);
  const openOverlay = useUI((s) => s.openOverlay);
  const openSheet = useUI((s) => s.openSheet);
  const startFeed = useUI((s) => s.startFeed);
  const lang = useUI((s) => s.lang);
  const user = useUser((s) => s.user);
  const name = useUser((s) => s.displayName ?? s.user?.displayName ?? null);
  const streak = useUser((s) => s.streak);
  const readDays = useUser((s) => s.readDays);
  const articlesRead = useUser((s) => s.articlesRead);
  const likes = useUser((s) => s.likes);
  const saves = useUser((s) => s.saves);
  const submissions = useUser((s) => s.submissions);
  const backend = useUser((s) => s.backend);
  const { data: feed } = useFeed();
  const [tab, setTab] = useState<Tab>('saved');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const signedIn = !!user && !user.isAnonymous;
  const today = localDate();
  const days = lastNDays(7, today);
  const read = new Set(readDays);
  const { value: current } = displayStreak(streak, today);

  useEffect(() => {
    if (open && signedIn && tab === 'posts') loadSubmissions();
  }, [open, signedIn, tab]);

  const list = useMemo(() => {
    const keys = tab === 'saved' ? saves : likes;
    return (feed?.items ?? []).filter((i) => keys[i.slug]);
  }, [feed, saves, likes, tab]);

  const weekday = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { weekday: 'narrow', timeZone: 'UTC' });

  return (
    <Panel open={open} onClose={() => closeOverlay('profile')} label={t('profile')} title={t('profile')}>
      <div className="pbody">
        <div className="prof">
          {signedIn ? (
            <Avatar name={name} className="bigav" />
          ) : (
            <span className="avatar guest bigav" aria-hidden="true">
              <UserRound className="ic" />
            </span>
          )}
          {editing ? (
            <form
              style={{ display: 'flex', gap: 8, marginTop: 12, width: '100%' }}
              onSubmit={(e) => {
                e.preventDefault();
                updateDisplayName(draft);
                setEditing(false);
              }}
            >
              <input className="input" value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} aria-label={t('editName')} autoFocus />
              <button className="pill" type="submit">
                {t('saveName')}
              </button>
            </form>
          ) : (
            <h3>
              {signedIn ? name : t('guest')}
              {signedIn && (
                <button
                  className="iconbtn"
                  type="button"
                  style={{ display: 'inline-grid', width: 32, height: 32, verticalAlign: -6 }}
                  aria-label={t('editName')}
                  onClick={() => {
                    setDraft(name ?? '');
                    setEditing(true);
                  }}
                >
                  <Pencil className="ic" style={{ width: 16, height: 16 }} aria-hidden="true" />
                </button>
              )}
            </h3>
          )}
          {signedIn && user?.email && <div className="email">{user.email}</div>}
          {!signedIn && <p className="sub" style={{ margin: '4px 0 0', color: 'var(--fg2)', fontSize: 14 }}>{t('guestProfileSub')}</p>}
          {!signedIn && (
            <button className="cta" type="button" style={{ width: '100%', marginTop: 14, flex: 'none' }} onClick={() => openSheet({ kind: 'login', reason: 'generic' })}>
              {t('continueGoogle')}
            </button>
          )}
          {signedIn && backend === 'local' && <p className="notice" style={{ marginTop: 12 }}>{t('demoModeSub')}</p>}
        </div>

        <div className="stats">
          <div className="stat">
            <b>🔥 {current}</b>
            <span>{t('currentStreak')}</span>
          </div>
          <div className="stat">
            <b>🏆 {streak.longest}</b>
            <span>{t('longestStreak')}</span>
          </div>
          <div className="stat">
            <b>📚 {articlesRead}</b>
            <span>{t('articlesRead')}</span>
          </div>
        </div>

        <div className="label">{t('last7days')}</div>
        <div className="week">
          {days.map((d) => (
            <div key={d} className={`day${read.has(d) ? ' on' : ''}${d === today ? ' today' : ''}`}>
              <i aria-hidden="true">{read.has(d) ? '🔥' : ''}</i>
              <span>{weekday(d)}</span>
            </div>
          ))}
        </div>

        <ReadingStats />

        <div className="tabs" role="tablist">
          {(['saved', 'liked', ...(signedIn ? (['posts'] as const) : [])] as Tab[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {k === 'saved' ? t('savedTab') : k === 'liked' ? t('likedTab') : t('postsTab')}
            </button>
          ))}
        </div>

        {tab !== 'posts' &&
          (list.length ? (
            <div className="grid">
              {list.map((i) => (
                <ArticleCard key={i.slug} item={i} onOpen={() => startFeed({ category: null, slug: i.slug })} />
              ))}
            </div>
          ) : (
            <div className="empty-note">{tab === 'saved' ? t('nothingSaved') : t('nothingLiked')}</div>
          ))}
        {tab === 'posts' &&
          (submissions?.length ? (
            <div>
              {submissions.map((s) => (
                <div key={s.id} className="subitem">
                  <span className="t">{s.title}</span>
                  <span className={`status ${s.status}`}>{t(`status_${s.status}` as 'status_pending')}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-note">{submissions ? t('noPosts') : '…'}</div>
          ))}

        <button className="rowbtn" type="button" style={{ marginTop: 18 }} onClick={() => openOverlay('settings')}>
          <Settings className="ic" aria-hidden="true" />
          {t('settings')}
        </button>
        <p className="fine" style={{ marginTop: 22 }}>
          <a href="/about">{t('about')}</a> · <a href="/privacy">{t('privacy')}</a> · <a href="/terms">{t('terms')}</a>
        </p>
      </div>
    </Panel>
  );
}

/** Reading stats, favourite topics, and the interest score behind the For You order. */
function ReadingStats() {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const { data: cats } = useCategories();
  const topics = useReading((s) => s.topics);
  const signals = useReading((s) => s.signals);
  const history = useReading((s) => s.history);
  const toggleTopic = useReading((s) => s.toggleTopic);
  const saved = useUser((s) => Object.keys(s.saves).length);
  const all = Object.values(signals);
  const opens = all.reduce((n, x) => n + x.opens, 0);
  const completes = all.reduce((n, x) => n + x.completes, 0);
  const minutes = Math.round(all.reduce((n, x) => n + x.ms, 0) / 60000);
  const scores = (cats ?? []).map((c) => ({ c, ...affinity(signals[c.id], topics.includes(c.id)) })).sort((a, b) => b.score - a.score);
  const top = Math.max(1, ...scores.map((x) => x.score));
  return (
    <>
      <div className="label">{t('readingStats')}</div>
      <div className="stats four">
        <div className="stat">
          <b>{history.filter((h) => h.done).length}</b>
          <span>{t('statFinished')}</span>
        </div>
        <div className="stat">
          <b>{minutes}</b>
          <span>{t('statMinutes')}</span>
        </div>
        <div className="stat">
          <b>{opens ? Math.round((Math.min(completes, opens) / opens) * 100) : 0}%</b>
          <span>{t('statFinishRate')}</span>
        </div>
        <div className="stat">
          <b>{saved}</b>
          <span>{t('statSaved')}</span>
        </div>
      </div>

      <div className="label">{t('topicsTitle')}</div>
      <p className="fine">{t('topicsSub')}</p>
      <div className="chips wrap">
        {cats?.map((c) => (
          <button key={c.id} className="chip solid" type="button" aria-pressed={topics.includes(c.id)} onClick={() => toggleTopic(c.id)}>
            <span aria-hidden="true">{c.emoji}</span>
            {pick(c.name, lang)}
          </button>
        ))}
      </div>

      <details className="why">
        <summary>{t('whyTitle')}</summary>
        <p className="fine">{t('whySub')}</p>
        {scores.map(({ c, score }) => (
          <div key={c.id} className="why-row">
            <span>{pick(c.name, lang)}</span>
            <i>
              <i style={{ transform: `scaleX(${Math.max(0, score) / top})` }} />
            </i>
            <b>{score.toFixed(1)}</b>
          </div>
        ))}
        <ul className="fine">
          {(['whyTopic', 'whyTime', 'whyFinish', 'whySave', 'whySkip', 'whyExplore'] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
