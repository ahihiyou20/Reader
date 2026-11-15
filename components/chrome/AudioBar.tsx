'use client';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect } from 'react';
import { fetchArticle } from '@/lib/data';
import { useUI } from '@/stores/ui';
import { restartSpeech, timing, trackFor, useAudio } from '@/stores/audio';
import { useReading } from '@/stores/reading';
import { useT } from '../hooks';

export const RATES = [0.8, 1, 1.25, 1.5];

/** Audio reading controls: play or pause, previous and next paragraph, seek, speed. Shown while a track is loaded. */
export function AudioBar() {
  const t = useT();
  const { slug, title, paras, i, offset, playing, toggle, seek, stop } = useAudio();
  const lang = useUI((s) => s.lang);
  const rate = useReading((s) => s.settings.rate);
  const setSettings = useReading((s) => s.setSettings);

  // Speech would otherwise go on after the tab is closed or reloaded on some browsers.
  useEffect(() => {
    const end = () => useAudio.getState().stop();
    window.addEventListener('pagehide', end);
    return () => window.removeEventListener('pagehide', end);
  }, []);

  // A new reading language: the article is read again from the top, in that language, with its title.
  useEffect(() => {
    const { slug: current, lang: was, playing: on } = useAudio.getState();
    if (!current || was === lang) return;
    let alive = true;
    fetchArticle(current)
      .then((a) => {
        if (!alive || useAudio.getState().slug !== current) return;
        const track = trackFor(a, lang);
        if (track.lang === was) return useAudio.setState({ title: track.title });
        if (on) useAudio.getState().play(track);
        else useAudio.setState({ ...track, i: 0, offset: 0 });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lang]);

  if (!slug) return null;
  const time = timing({ paras, i, offset }, rate);
  const nextRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1;
  return (
    <div className="audiobar" role="region" aria-label={t('audioTitle')}>
      <div className="audiobar-text">
        <b>{title}</b>
        <span>
          <time>{clock(time.elapsed)}</time> · −{clock(Math.max(0, time.total - time.elapsed))} · {t('audioPart', { i: Math.min(i + 1, paras.length), n: paras.length })}
        </span>
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

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
