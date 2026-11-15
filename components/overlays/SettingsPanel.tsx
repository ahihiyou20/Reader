'use client';
import { Download, Headphones, LogOut, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exportMyData, setLanguage, signOut } from '@/lib/actions';
import { LANG_NAME, LANGS, LOCALE } from '@/lib/content/types';
import { canSpeak, restartSpeech, voicesFor } from '@/stores/audio';
import { useReading } from '@/stores/reading';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { RATES } from '../chrome/AudioBar';
import { useT } from '../hooks';
import { Panel } from './Layer';

/** Settings: language, reading text size, audio voice and speed, account. */
export function SettingsPanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('settings'));
  const closeOverlay = useUI((s) => s.closeOverlay);
  const openSheet = useUI((s) => s.openSheet);
  const toast = useUI((s) => s.showToast);
  const lang = useUI((s) => s.lang);
  const signedIn = useUser((s) => !!s.user && !s.user.isAnonymous);
  const settings = useReading((s) => s.settings);
  const setSettings = useReading((s) => s.setSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Voices load asynchronously in Chrome and differ per language.
  useEffect(() => {
    if (!open || !canSpeak()) return;
    const load = () => setVoices(voicesFor(lang));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, [open, lang]);

  const sample = () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t('tagline'));
    u.lang = LOCALE[lang];
    u.rate = settings.rate;
    const v = voices.find((x) => x.voiceURI === settings.voice[lang]);
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  };

  return (
    <Panel open={open} onClose={() => closeOverlay('settings')} label={t('settings')} title={t('settings')}>
      <div className="pbody">
        <div className="label">{t('language')}</div>
        <div className="seg wrap" role="group" aria-label={t('language')}>
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} lang={l} onClick={() => setLanguage(l)}>
              {LANG_NAME[l]}
            </button>
          ))}
        </div>

        <div className="label">
          {t('readingSize')} · {settings.fontSize}px
        </div>
        <input className="range" type="range" min={15} max={24} step={1} value={settings.fontSize} onChange={(e) => setSettings({ fontSize: Number(e.target.value) })} aria-label={t('readingSize')} />
        <p className="size-sample" style={{ fontSize: settings.fontSize }}>
          {t('tagline')}
        </p>

        {canSpeak() && (
          <>
            <div className="label">{t('voice')}</div>
            <select
              className="input"
              value={settings.voice[lang] ?? ''}
              aria-label={t('voice')}
              onChange={(e) => {
                setSettings({ voice: { ...settings.voice, [lang]: e.target.value || undefined } });
                restartSpeech();
              }}
            >
              <option value="">{t('voiceDefault')}</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </select>
            {!voices.length && <p className="fine">{t('noVoices', { lang: LANG_NAME[lang] })}</p>}

            <div className="label">{t('speed')}</div>
            <div className="seg" role="group" aria-label={t('speed')}>
              {RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={settings.rate === r}
                  onClick={() => {
                    setSettings({ rate: r });
                    restartSpeech();
                  }}
                >
                  {r}×
                </button>
              ))}
            </div>
            <button className="rowbtn" type="button" onClick={sample} style={{ marginTop: 10 }}>
              <Headphones className="ic" aria-hidden="true" />
              {t('testVoice')}
            </button>
          </>
        )}

        <div className="label">{t('account')}</div>
        <button
          className="rowbtn"
          type="button"
          onClick={() => {
            useReading.getState().setWelcomed(false);
            useUI.setState({ overlays: [] });
          }}
        >
          <Sparkles className="ic" aria-hidden="true" />
          {t('intro')}
        </button>
        <button className="rowbtn" type="button" onClick={() => exportMyData()}>
          <Download className="ic" aria-hidden="true" />
          {t('exportData')}
        </button>
        <button
          className="rowbtn"
          type="button"
          onClick={() => {
            useReading.getState().reset();
            toast(t('resetReadingDone'));
          }}
        >
          <RotateCcw className="ic" aria-hidden="true" />
          {t('resetReading')}
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
        <p className="fine" style={{ marginTop: 22 }}>
          <a href="/about">{t('about')}</a> · <a href="/privacy">{t('privacy')}</a> · <a href="/terms">{t('terms')}</a>
        </p>
      </div>
    </Panel>
  );
}
