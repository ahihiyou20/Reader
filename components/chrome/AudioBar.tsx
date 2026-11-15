'use client';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect } from 'react';
import { useAudio, restartSpeech } from '@/stores/audio';
import { useReading } from '@/stores/reading';
import { useT } from '../hooks';

export const RATES = [0.8, 1, 1.25, 1.5];

/** Audio reading controls: play or pause, previous and next paragraph, seek, speed. Shown while a track is loaded. */
export function AudioBar() {
  const t = useT();
  const { slug, title, paras, i, playing, toggle, seek, stop } = useAudio();
  const rate = useReading((s) => s.settings.rate);
  const setSettings = useReading((s) => s.setSettings);

  // Speech would otherwise go on after the tab is closed or reloaded on some browsers.
  useEffect(() => {
    const end = () => useAudio.getState().stop();
    window.addEventListener('pagehide', end);
    return () => window.removeEventListener('pagehide', end);
  }, []);

  if (!slug) return null;
  const nextRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1;
  return (
    <div className="audiobar" role="region" aria-label={t('audioTitle')}>
      <div className="audiobar-text">
        <b>{title}</b>
        <span>{t('audioPart', { i: Math.min(i + 1, paras.length), n: paras.length })}</span>
      </div>
      <button className="iconbtn" type="button" aria-label={t('audioPrev')} onClick={() => seek(i - 1)} disabled={i === 0}>
        <SkipBack className="ic" aria-hidden="true" />
      </button>
      <button className="iconbtn main" type="button" aria-label={playing ? t('audioPause') : t('audioPlay')} onClick={toggle}>
        {playing ? <Pause className="ic" aria-hidden="true" /> : <Play className="ic" aria-hidden="true" />}
      </button>
      <button className="iconbtn" type="button" aria-label={t('audioNext')} onClick={() => seek(i + 1)} disabled={i >= paras.length - 1}>
        <SkipForward className="ic" aria-hidden="true" />
      </button>
      <button
        className="audiobar-rate"
        type="button"
        aria-label={t('audioSpeed', { rate })}
        onClick={() => {
          setSettings({ rate: nextRate });
          restartSpeech();
        }}
      >
        {rate}×
      </button>
      <button className="iconbtn" type="button" aria-label={t('close')} onClick={stop}>
        <X className="ic" aria-hidden="true" />
      </button>
      <input
        className="audiobar-seek"
        type="range"
        min={0}
        max={Math.max(0, paras.length - 1)}
        value={Math.min(i, paras.length - 1)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label={t('audioSeek')}
      />
    </div>
  );
}
