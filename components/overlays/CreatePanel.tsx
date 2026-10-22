'use client';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { getBackend } from '@/lib/backend';
import { errorMessage, loadSubmissions } from '@/lib/actions';
import { track } from '@/lib/analytics';
import type { Lang } from '@/lib/content/types';
import { useUI } from '@/stores/ui';
import { useT } from '../hooks';
import { Panel } from './Layer';

interface Draft {
  title: string;
  hook: string;
  sections: Array<{ heading: string; body: string }>;
  sources: string;
  coverUrl: string;
  lang: Lang;
}
const EMPTY = (lang: Lang): Draft => ({ title: '', hook: '', sections: [{ heading: '', body: '' }], sources: '', coverUrl: '', lang });
const KEY = 'reader.createDraft';

/** FR-25 Create post: a signed-in reader submits a post for editors to review (docs/05 step 10). */
export function CreatePanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('create'));
  const closeOverlay = useUI((s) => s.closeOverlay);
  const toast = useUI((s) => s.showToast);
  const lang = useUI((s) => s.lang);
  const [d, setD] = useState<Draft>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
      if (saved) return JSON.parse(saved) as Draft;
    } catch {}
    return EMPTY(lang);
  });
  const [sending, setSending] = useState(false);
  const update = (patch: Partial<Draft>) =>
    setD((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const setSection = (i: number, patch: Partial<Draft['sections'][number]>) =>
    update({ sections: d.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sections = d.sections.filter((s) => s.body.trim());
    if (!d.title.trim() || !d.hook.trim() || !sections.length) return toast(t('formIncomplete'));
    setSending(true);
    try {
      await (
        await getBackend()
      ).submitPost({
        title: d.title.trim(),
        hook: d.hook.trim(),
        sections: sections.map((s) => ({ heading: s.heading.trim() || undefined, body: s.body.trim() })),
        references: d.sources
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        coverUrl: d.coverUrl.trim() || undefined,
        lang: d.lang,
      });
      track('submit_post', { lang: d.lang });
      toast(t('submitted'));
      try {
        localStorage.removeItem(KEY);
      } catch {}
      setD(EMPTY(lang));
      loadSubmissions();
      closeOverlay('create');
    } catch (err) {
      toast(errorMessage(err) || t('signInFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Panel open={open} onClose={() => closeOverlay('create')} label={t('createTitle')} title={t('createTitle')} closeIcon="x">
      <form className="pbody" onSubmit={submit}>
        <p className="sub" style={{ margin: '0 0 4px', color: 'var(--fg2)', font: '500 14px/20px var(--font-sans)' }}>
          {t('createSub')}
        </p>
        <p className="fine" style={{ textAlign: 'left', margin: '0 0 16px' }}>
          {t('createLicense')}
        </p>
        <label className="field">
          <span>
            {t('fieldTitle')} <em className="counter">{d.title.length}/120</em>
          </span>
          <input className="input" value={d.title} maxLength={120} placeholder={t('fieldTitlePh')} onChange={(e) => update({ title: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('fieldHook')}</span>
          <textarea className="textarea" value={d.hook} maxLength={1200} rows={3} placeholder={t('fieldHookPh')} onChange={(e) => update({ hook: e.target.value })} />
        </label>
        {d.sections.map((s, i) => (
          <div key={i} className="secbox">
            <div className="field" style={{ marginBottom: 8 }}>
              <span>{t('fieldSection', { n: i + 1 })}</span>
            </div>
            {d.sections.length > 1 && (
              <button className="iconbtn rm" type="button" aria-label={t('removeSection')} onClick={() => update({ sections: d.sections.filter((_, k) => k !== i) })}>
                <X className="ic" aria-hidden="true" />
              </button>
            )}
            <input className="input" value={s.heading} maxLength={120} placeholder={t('fieldHeadingPh')} onChange={(e) => setSection(i, { heading: e.target.value })} />
            <textarea className="textarea" value={s.body} maxLength={2000} rows={4} placeholder={t('fieldBodyPh')} onChange={(e) => setSection(i, { body: e.target.value })} />
          </div>
        ))}
        {d.sections.length < 10 && (
          <button className="addbtn" type="button" onClick={() => update({ sections: [...d.sections, { heading: '', body: '' }] })}>
            <Plus className="ic" aria-hidden="true" />
            {t('addSection')}
          </button>
        )}
        <label className="field">
          <span>{t('fieldSources')}</span>
          <textarea className="textarea" value={d.sources} rows={3} placeholder={t('fieldSourcesPh')} onChange={(e) => update({ sources: e.target.value })} />
        </label>
        <label className="field">
          <span>{t('fieldCover')}</span>
          <input className="input" type="url" inputMode="url" value={d.coverUrl} placeholder={t('fieldCoverPh')} onChange={(e) => update({ coverUrl: e.target.value })} />
        </label>
        <div className="field">
          <span>{t('fieldLang')}</span>
          <span className="seg" style={{ marginLeft: 0 }}>
            {(['vi', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={d.lang === l} onClick={() => update({ lang: l })}>
                {l === 'vi' ? 'Tiếng Việt' : 'English'}
              </button>
            ))}
          </span>
        </div>
        <button className="cta" type="submit" style={{ width: '100%', flex: 'none', marginTop: 8 }} disabled={sending}>
          {sending ? t('submitting') : t('submit')}
        </button>
      </form>
    </Panel>
  );
}
