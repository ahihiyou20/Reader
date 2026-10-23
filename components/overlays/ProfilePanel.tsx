'use client';
import { Download, Globe, LogOut, Pencil, Trash2, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { exportMyData, loadSubmissions, setLanguage, signOut, updateDisplayName } from '@/lib/actions';
import { useFeed } from '@/lib/data';
import { displayStreak, lastNDays, localDate } from '@/lib/streak';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { Avatar } from '../chrome/Avatar';
import { useT } from '../hooks';
import { ArticleCard } from './ArticleCard';
import { Panel } from './Layer';

type Tab = 'saved' | 'liked' | 'posts';

/** SCR-07 Profile: stats, last 7 days, Saved / Liked / My posts, language, account. */
export function ProfilePanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('profile'));
  const closeOverlay = useUI((s) => s.closeOverlay);
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
    new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'narrow', timeZone: 'UTC' });

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

        <div className="label">{t('language')}</div>
        <div className="rowbtn" style={{ borderBottom: 0 }}>
          <Globe className="ic" aria-hidden="true" />
          {t('language')}
          <span className="seg">
            {(['vi', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLanguage(l)}>
                {l === 'vi' ? 'Tiếng Việt' : 'English'}
              </button>
            ))}
          </span>
        </div>

        <div style={{ marginTop: 18 }}>
          <button className="rowbtn" type="button" onClick={() => exportMyData()}>
            <Download className="ic" aria-hidden="true" />
            {t('exportData')}
          </button>
          {signedIn && (
            <button className="rowbtn" type="button" onClick={() => signOut()}>
              <LogOut className="ic" aria-hidden="true" />
              {t('signOut')}
            </button>
          )}
          <button className="rowbtn danger" type="button" onClick={() => openSheet({ kind: 'deleteAccount' })}>
            <Trash2 className="ic" aria-hidden="true" />
            {t('deleteAccount')}
          </button>
        </div>
        <p className="fine" style={{ marginTop: 22 }}>
          <a href="/about">{t('about')}</a> · <a href="/privacy">{t('privacy')}</a> · <a href="/terms">{t('terms')}</a>
        </p>
      </div>
    </Panel>
  );
}
