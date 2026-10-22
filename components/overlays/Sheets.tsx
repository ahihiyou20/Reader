'use client';
import { Copy, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useArticle } from '@/lib/data';
import { backendKind, isChromeLike, isInAppBrowser } from '@/lib/backend';
import { cancelOneTap, promptOneTap } from '@/lib/backend/onetap';
import { deleteAccount, signInWithGoogle } from '@/lib/actions';
import { pick } from '@/lib/i18n';
import { licenseName } from '@/lib/content/transform';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { GoogleLogo } from '../icons';
import { useT } from '../hooks';
import { Sheet } from './Layer';

export function Sheets() {
  const sheet = useUI((s) => s.sheet);
  const close = useUI((s) => s.closeSheet);
  const t = useT();
  return (
    <>
      <Sheet open={sheet?.kind === 'login'} onClose={close} label={t('loginTitle')}>
        <LoginSheetBody reason={sheet?.kind === 'login' ? sheet.reason : 'generic'} />
      </Sheet>
      <Sheet open={sheet?.kind === 'sources'} onClose={close} label={t('sources')}>
        {sheet?.kind === 'sources' && <SourcesBody slug={sheet.slug} refId={sheet.refId} />}
      </Sheet>
      <Sheet open={sheet?.kind === 'deleteAccount'} onClose={close} label={t('deleteAccountTitle')}>
        <DeleteBody />
      </Sheet>
    </>
  );
}

/** CMP-23 LoginSheet (docs/07 §9). */
function LoginSheetBody({ reason }: { reason: 'comment' | 'create' | 'generic' }) {
  const t = useT();
  const busy = useUser((s) => s.busy);
  const open = useUI((s) => s.sheet?.kind === 'login');
  const close = useUI((s) => s.closeSheet);
  const toast = useUI((s) => s.showToast);
  const inApp = typeof navigator !== 'undefined' && isInAppBrowser();

  // Google One Tap on Chrome / Android, alongside the regular button.
  useEffect(() => {
    if (!open || inApp || backendKind !== 'firebase' || !isChromeLike()) return;
    let alive = true;
    promptOneTap().then((token) => {
      if (alive && token) signInWithGoogle(token);
    });
    return () => {
      alive = false;
      cancelOneTap();
    };
  }, [open, inApp]);

  const sub = reason === 'comment' ? t('loginReasonComment') : reason === 'create' ? t('loginReasonCreate') : t('loginSub');
  if (inApp) {
    return (
      <div>
        <div className="logo-mark" aria-hidden="true">
          R
        </div>
        <h2>{t('inAppTitle')}</h2>
        <p className="sub">{t('inAppSub')}</p>
        <button
          className="gbtn"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              toast(t('copied'));
            } catch {
              toast(location.href);
            }
          }}
        >
          <Copy aria-hidden="true" />
          {t('copyLink')}
        </button>
        <button className="textbtn" type="button" onClick={close}>
          {t('notNow')}
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="logo-mark" aria-hidden="true">
        R
      </div>
      <h2>{t('loginTitle')}</h2>
      <p className="sub">{sub}</p>
      {backendKind === 'local' && (
        <p className="notice">
          <b>{t('demoMode')}.</b> {t('demoModeSub')}
        </p>
      )}
      <button className="gbtn" type="button" disabled={busy !== null} onClick={() => signInWithGoogle()}>
        <GoogleLogo />
        {busy === 'merging' ? t('merging') : t('continueGoogle')}
      </button>
      <button className="textbtn" type="button" onClick={close}>
        {t('notNow')}
      </button>
      <p className="fine">
        {t('loginConsent', { terms: '§T', privacy: '§P' })
          .split(/(§T|§P)/)
          .map((part, i) =>
            part === '§T' ? (
              <a key={i} href="/terms" target="_blank" rel="noopener">
                {t('terms')}
              </a>
            ) : part === '§P' ? (
              <a key={i} href="/privacy" target="_blank" rel="noopener">
                {t('privacy')}
              </a>
            ) : (
              part
            ),
          )}
      </p>
    </div>
  );
}

/** CMP-12 SourceSheet: numbered references, then attribution of the text and the cover. */
function SourcesBody({ slug, refId }: { slug: string; refId?: string }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const { data: a } = useArticle(slug);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!refId || !list.current) return;
    const el = list.current.querySelector<HTMLElement>(`[data-ref="${CSS.escape(refId)}"]`);
    el?.scrollIntoView({ block: 'center' });
  }, [refId, a]);
  if (!a) return null;
  const o = a.origin;
  return (
    <div>
      <h2>{t('sources')}</h2>
      <p className="sub">{t('sourcesSub')}</p>
      {a.references.length > 0 && (
        <ol className="srcs" ref={list}>
          {a.references.map((r) => (
            <li key={r.id} data-ref={r.id} className={r.id === refId ? 'flash' : undefined}>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {r.label} <ExternalLink style={{ display: 'inline', width: 13, height: 13, verticalAlign: -1, opacity: 0.6 }} aria-hidden="true" />
                </a>
              ) : (
                r.label
              )}
              {r.url && <span>{r.url.replace(/^https?:\/\//, '').slice(0, 80)}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="attrib">
        <h3>{t('attribution')}</h3>
        <p>{pick(a.attribution, lang)}</p>
        {o.originalUrl && (
          <p>
            <a href={o.originalUrl} target="_blank" rel="noopener noreferrer">
              {o.originalTitle ?? o.originalUrl}
            </a>
          </p>
        )}
        <p>
          {t('coverCredit', { author: a.cover.author, license: a.cover.license })}
          {a.cover.sourceUrl && (
            <>
              {' · '}
              <a href={a.cover.sourceUrl} target="_blank" rel="noopener noreferrer">
                {t('openLink')}
              </a>
            </>
          )}
        </p>
        <p style={{ margin: 0, opacity: 0.7 }}>{licenseName(o.license)}</p>
      </div>
    </div>
  );
}

function DeleteBody() {
  const t = useT();
  const close = useUI((s) => s.closeSheet);
  const [deleteComments, setDeleteComments] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <h2>{t('deleteAccountTitle')}</h2>
      <p className="sub">{t('deleteAccountSub')}</p>
      <label className="rowbtn" style={{ cursor: 'pointer' }}>
        <input type="radio" name="dc" checked={!deleteComments} onChange={() => setDeleteComments(false)} />
        {t('keepCommentsAnon')}
      </label>
      <label className="rowbtn" style={{ cursor: 'pointer', marginBottom: 18 }}>
        <input type="radio" name="dc" checked={deleteComments} onChange={() => setDeleteComments(true)} />
        {t('deleteCommentsToo')}
      </label>
      <button
        className="gbtn"
        type="button"
        style={{ background: 'var(--danger)', color: '#fff' }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await deleteAccount(deleteComments);
          setBusy(false);
        }}
      >
        {t('deleteConfirm')}
      </button>
      <button className="textbtn" type="button" onClick={close}>
        {t('cancel')}
      </button>
    </div>
  );
}
