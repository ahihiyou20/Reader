'use client';
// SCR-03 Comments & Apply (FR-14..FR-18). No paywall: everyone sees every comment.
import { Check, CircleArrowRight, EyeOff, Heart, MessageCircle, MessagesSquare, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleClient, FeedItem } from '@/lib/content/types';
import { getBackend } from '@/lib/backend';
import type { CommentDoc } from '@/lib/backend/types';
import { errorMessage, needsGoogle, setApplyStep } from '@/lib/actions';
import { track } from '@/lib/analytics';
import { timeAgo } from '@/lib/format';
import { pick } from '@/lib/i18n';
import { prefersReducedMotion } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { countsFor, useUser } from '@/stores/user';
import { avatarColor, initials } from '../icons';
import { useT } from '../hooks';

export function EngageView({ article, item, active, view }: { article: ArticleClient; item: FeedItem; active: boolean; view: number }) {
  const t = useT();
  const openOverlay = useUI((s) => s.openOverlay);
  const startFeed = useUI((s) => s.startFeed);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const comments = useComments(article.slug, active && view === 2, active && view >= 1);
  const count = useUser((s) => countsFor(s, item.slug, article.counts).comments);
  const shown = Math.max(count, comments.items.length);

  const reply = (name: string) => {
    setDraft((d) => (d.startsWith(`@${name} `) ? d : `@${name} ${d}`));
    input.current?.focus();
  };

  return (
    <>
      <div className="escroll">
        <ApplyCard article={article} />
        <div className="chead">
          <MessageCircle className="ic" aria-hidden="true" />
          <span>{t('comments', { n: shown })}</span>
        </div>
        <CommentList state={comments} onReply={reply} />
      </div>
      <div className="ebottom">
        <CommentForm slug={article.slug} draft={draft} setDraft={setDraft} inputRef={input} onPosted={comments.add} />
        <div className="ctarow">
          <button className="cta" type="button" onClick={() => openOverlay('explore')}>
            {t('exploreNow')}
            <CircleArrowRight className="ic" aria-hidden="true" />
          </button>
          <button
            className="ctaside"
            type="button"
            aria-label={t('related')}
            onClick={() => startFeed({ category: article.category })}
          />
        </div>
      </div>
    </>
  );
}

// ---------- Apply (FR-15) ----------

function ApplyCard({ article }: { article: ArticleClient }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const steps = pick(article.applySteps, lang) ?? [];
  const done = useUser((s) => s.progress[article.slug]?.applyDone);
  const [burst, setBurst] = useState(0);
  if (!steps.length) return null;
  const all = steps.length > 0 && steps.every((_, i) => done?.[i]);
  return (
    <div className="apply">
      <h3>{t('applyTitle')}</h3>
      <p className="asub">{t('applySub')}</p>
      {steps.map((s, i) => (
        <button
          key={i}
          className="step"
          type="button"
          aria-pressed={Boolean(done?.[i])}
          onClick={async () => {
            if (await setApplyStep(article.slug, i, !done?.[i])) setBurst((b) => b + 1);
          }}
        >
          <span className="chk">
            <Check className="ic" strokeWidth={3.2} aria-hidden="true" />
          </span>
          <span className="stx">{s}</span>
        </button>
      ))}
      {all && (
        <div className="abadge">
          <Check className="ic" strokeWidth={3} aria-hidden="true" />
          {t('applied')}
        </div>
      )}
      {burst > 0 && <Confetti key={burst} />}
    </div>
  );
}

const CONFETTI = ['#fff', '#FDE68A', '#F9A8D4', '#A5B4FC', '#86EFAC', '#FDBA74'];
function Confetti() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const pieces = Array.from(ref.current?.children ?? []) as HTMLElement[];
    pieces.forEach((p, i) => {
      const a = (i / pieces.length) * Math.PI * 2 + Math.random() * 0.4;
      const d = 60 + Math.random() * 70;
      p.animate(
        [
          { opacity: 1, transform: 'translate(0,0) rotate(0deg)' },
          { opacity: 0, transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 40}px) rotate(${Math.random() * 540}deg)` },
        ],
        { duration: 600, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' },
      );
    });
  }, []);
  return (
    <div className="confetti" ref={ref} aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i key={i} style={{ background: CONFETTI[i % CONFETTI.length] }} />
      ))}
    </div>
  );
}

// ---------- Comments (FR-16, FR-17) ----------

interface CommentsState {
  items: CommentDoc[];
  loading: boolean;
  more: boolean;
  loadMore: () => void;
  add: (c: CommentDoc) => void;
  remove: (id: string) => void;
  patch: (id: string, p: Partial<CommentDoc>) => void;
}

function useComments(slug: string, live: boolean, wanted: boolean): CommentsState {
  const [items, setItems] = useState<CommentDoc[]>([]);
  const [older, setOlder] = useState<CommentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);
  const local = useRef<CommentDoc[]>([]);

  // One read when the article is opened, a live listener only while this view is on screen (docs/06 §3.4).
  useEffect(() => {
    if (!wanted || loaded) return;
    let cancelled = false;
    getBackend()
      .then((b) => b.listComments(slug, null, 20))
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.cursor);
        setLoaded(true);
      })
      .catch(() => setLoaded(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, wanted, loaded]);

  useEffect(() => {
    if (!live) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    getBackend().then((b) => {
      if (cancelled) return;
      off = b.watchComments(slug, (list) => {
        setItems(list);
        setLoading(false);
        local.current = local.current.filter((c) => !list.some((x) => x.id === c.id));
      });
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [slug, live]);

  const merged = useMemo(() => {
    const seen = new Set<string>();
    const out: CommentDoc[] = [];
    for (const c of [...local.current, ...items, ...older]) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, older, local.current.length]);

  return {
    items: merged,
    loading: loading && wanted,
    more: Boolean(cursor),
    loadMore: () => {
      getBackend()
        .then((b) => b.listComments(slug, cursor, 20))
        .then((page) => {
          setOlder((o) => [...o, ...page.items]);
          setCursor(page.cursor);
        })
        .catch(() => {});
    },
    add: (c) => {
      local.current = [c, ...local.current];
      setItems((x) => [...x]);
    },
    remove: (id) => {
      local.current = local.current.filter((c) => c.id !== id);
      setItems((x) => x.filter((c) => c.id !== id));
      setOlder((x) => x.filter((c) => c.id !== id));
    },
    patch: (id, p) => {
      const upd = (list: CommentDoc[]) => list.map((c) => (c.id === id ? { ...c, ...p } : c));
      local.current = upd(local.current);
      setItems(upd);
      setOlder(upd);
    },
  };
}

function CommentList({ state, onReply }: { state: CommentsState; onReply: (name: string) => void }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const uid = useUser((s) => s.user?.uid);
  const isMod = useUser((s) => s.isModerator);
  const toast = useUI((s) => s.showToast);
  const first = useRef(true);
  const reduce = prefersReducedMotion();
  useEffect(() => {
    if (state.items.length) first.current = false;
  }, [state.items.length]);

  if (state.loading && !state.items.length) {
    return (
      <div style={{ display: 'grid', gap: 14, padding: '10px 0' }} aria-busy="true">
        {[0, 1].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            <div className="skel" style={{ width: 34, height: 34, borderRadius: '50%' }} />
            <div style={{ flex: 1, display: 'grid', gap: 8 }}>
              <div className="skel" style={{ height: 12, width: '40%' }} />
              <div className="skel" style={{ height: 12, width: '85%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!state.items.length) {
    return (
      <div className="cempty">
        <MessagesSquare className="ic" strokeWidth={1.6} aria-hidden="true" />
        <span>{t('noComments')}</span>
        <small>{t('beFirst')}</small>
      </div>
    );
  }

  const like = async (c: CommentDoc) => {
    const on = !c.likedByMe;
    state.patch(c.id, { likedByMe: on, likeCount: Math.max(0, c.likeCount + (on ? 1 : -1)) });
    try {
      await (await getBackend()).setCommentLike(c.slug, c.id, on);
    } catch (e) {
      state.patch(c.id, { likedByMe: c.likedByMe, likeCount: c.likeCount });
      toast(errorMessage(e) || t('signInFailed'));
    }
  };
  const remove = async (c: CommentDoc, hide: boolean) => {
    if (!hide && !window.confirm(t('deleteComment'))) return;
    state.remove(c.id);
    try {
      const b = await getBackend();
      if (hide) await b.hideComment(c.slug, c.id);
      else await b.deleteComment(c.slug, c.id);
      if (!hide) useUser.setState((s) => ({ deltas: { ...s.deltas, [c.slug]: { ...s.deltas[c.slug], comments: (s.deltas[c.slug]?.comments ?? 0) - 1 } } }));
      toast(hide ? t('commentHidden') : t('commentDeleted'));
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <div className="clist">
      {state.items.map((c, i) => (
        <div
          key={c.id}
          className="citem"
          style={
            first.current && !reduce && i < 8
              ? { animation: `citem-in 200ms ${i * 40}ms cubic-bezier(.23,1,.32,1) both` }
              : undefined
          }
        >
          <div className="cav" style={{ background: avatarColor(c.uid) }} aria-hidden="true">
            {c.photoURL ? <img src={c.photoURL} alt="" referrerPolicy="no-referrer" /> : initials(c.displayName)}
          </div>
          <div className="cbody">
            <div className="cname">
              {c.displayName}
              <span>{c.pending ? t('justNow') : timeAgo(c.createdAt, lang)}</span>
            </div>
            <p className="ctext" lang={c.lang}>
              {c.text}
            </p>
            <div className="cacts">
              <button type="button" className={c.likedByMe ? 'on' : undefined} aria-pressed={Boolean(c.likedByMe)} onClick={() => like(c)}>
                <Heart className="ic" aria-hidden="true" />
                {c.likeCount > 0 ? c.likeCount : t('like')}
              </button>
              <button type="button" onClick={() => onReply(c.displayName)}>
                {t('reply')}
              </button>
              {c.uid === uid && (
                <button type="button" onClick={() => remove(c, false)} aria-label={t('delete')}>
                  <Trash2 className="ic" aria-hidden="true" />
                </button>
              )}
              {isMod && c.uid !== uid && (
                <button type="button" onClick={() => remove(c, true)}>
                  <EyeOff className="ic" aria-hidden="true" />
                  {t('hide')}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      {state.more && (
        <button className="textbtn" type="button" onClick={state.loadMore}>
          {t('loadMore')}
        </button>
      )}
    </div>
  );
}

function CommentForm({
  slug,
  draft,
  setDraft,
  inputRef,
  onPosted,
}: {
  slug: string;
  draft: string;
  setDraft: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPosted: (c: CommentDoc) => void;
}) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const toast = useUI((s) => s.showToast);
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    if (text.length > 500) return toast(t('commentTooLong'));
    if (needsGoogle('comment')) return;
    setSending(true);
    try {
      const c = await (await getBackend()).addComment(slug, text, lang);
      onPosted({ ...c, pending: true });
      useUser.setState((s) => ({ deltas: { ...s.deltas, [slug]: { ...s.deltas[slug], comments: (s.deltas[slug]?.comments ?? 0) + 1 } } }));
      setDraft('');
      inputRef.current?.blur();
      track('comment', { articleId: slug, lang });
    } catch (err) {
      toast(errorMessage(err) || t('signInFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={`cform${draft ? ' has-text' : ''}`} onSubmit={submit}>
      <input
        ref={inputRef}
        className="cin"
        name="comment"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          if (needsGoogle('comment')) e.currentTarget.blur();
        }}
        maxLength={500}
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="send"
        placeholder={t('writeComment')}
        aria-label={t('writeComment')}
      />
      <button className="csend" type="submit" aria-label={t('send')} disabled={sending}>
        <Send className="ic" aria-hidden="true" />
      </button>
    </form>
  );
}
