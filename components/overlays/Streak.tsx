'use client';
import { m } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { LOCALE } from '@/lib/content/types';
import { spring } from '@/lib/motion';
import { addDays, displayStreak, FREEZE_GOAL_MS, FREEZE_MAX, localDate, milestone, type Streak } from '@/lib/streak';
import { canClaimFreeze, useReading } from '@/stores/reading';
import { claimFreeze } from '@/lib/actions';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { CountRoll } from '../ui/CountRoll';
import { useReducedMotion, useT } from '../hooks';
import { BooksGlyph, FlameGlyph, IceGlyph, TrophyGlyph } from '../icons';

/** The streak: today's count, the way to the next milestone, and what stands behind it. */
export function StreakHero({ streak, articlesRead }: { streak: Streak; articlesRead: number }) {
  const t = useT();
  const still = useReducedMotion();
  const freezes = useReading((s) => s.freeze.count);
  const { value, readToday } = displayStreak(streak, localDate());
  const { from, to } = milestone(value);
  const p = (value - from) / (to - from);
  const move = still ? { duration: 0 } : { ...spring.default, duration: 0.9, delay: 0.15 };
  return (
    <section className="pf-card sh" data-lit={readToday || undefined}>
      <div className="sh-top">
        <span className="sh-flame">
          <FlameGlyph size={52} />
        </span>
        <div className="sh-count">
          <CountRoll value={value} className="sh-n" />
          <span className="sh-unit">{t('streakDays')}</span>
        </div>
      </div>
      <p className="sh-status">{readToday ? t('streakDone') : t('streakKeep')}</p>
      <div className="sh-track" role="img" aria-label={t('streakNext', { n: to - value, m: to })}>
        <span className="sh-end">{from}</span>
        <div className="sh-rail">
          <m.i className="sh-fill" initial={{ scaleX: still ? p : 0 }} animate={{ scaleX: p }} transition={move} />
          {/* Spans the rail, so x as a percentage of itself is a position along the rail. */}
          <m.div
            className="sh-beadway"
            initial={{ x: still ? `${p * 100}%` : '0%' }}
            animate={{ x: `${p * 100}%` }}
            transition={move}
          >
            <b className="sh-bead" />
          </m.div>
        </div>
        <span className="sh-end sh-goal">{to}</span>
      </div>
      <p className="sh-next">{t('streakNext', { n: to - value, m: to })}</p>
      <dl className="sh-ledger">
        <div>
          <dt>{t('longestStreak')}</dt>
          <dd>
            <TrophyGlyph size={18} />
            {streak.longest}
          </dd>
        </div>
        <div>
          <dt>{t('freezesStat')}</dt>
          <dd>
            <IceGlyph size={18} />
            {freezes}
          </dd>
        </div>
        <div>
          <dt>{t('articlesRead')}</dt>
          <dd>
            <BooksGlyph size={18} />
            {articlesRead}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** The day's streak freeze: reading time toward it, the claim, and the freezes held. */
export function FreezeCard() {
  const t = useT();
  const still = useReducedMotion();
  const day = localDate();
  const freeze = useReading((s) => s.freeze);
  const ms = useReading((s) => (s.today.day === day ? s.today.ms : 0));
  const claimable = useReading((s) => canClaimFreeze(s, day));
  const full = freeze.count >= FREEZE_MAX;
  const minutes = Math.min(5, Math.floor(ms / 60_000));
  const line = claimable
    ? t('freezeReadySub')
    : freeze.claimed === day
      ? t('freezeClaimed')
      : full
        ? t('freezeFull')
        : t('freezeProgress', { m: minutes });
  return (
    <section className="pf-card fz" data-ready={claimable || undefined}>
      <div className="fz-slots" aria-label={`${freeze.count}/${FREEZE_MAX}`}>
        {Array.from({ length: FREEZE_MAX }, (_, i) =>
          i < freeze.count ? (
            <m.span
              key={`on${i}`}
              initial={still ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring.pop}
            >
              <IceGlyph size={34} />
            </m.span>
          ) : (
            <span key={`off${i}`}>
              <IceGlyph size={34} empty />
            </span>
          ),
        )}
      </div>
      <div className="fz-text">
        <h3>{claimable ? t('freezeReady') : t('freezeTitle')}</h3>
        <p>{line}</p>
        {!claimable && !full && freeze.claimed !== day && (
          <i className="fz-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${Math.min(1, ms / FREEZE_GOAL_MS)})` }} />
          </i>
        )}
      </div>
      {claimable && (
        <button className="fz-claim" type="button" onClick={claimFreeze}>
          {t('freezeClaim')}
        </button>
      )}
      <p className="fz-how">{t('freezeHow')}</p>
    </section>
  );
}

/** A month of reading: days read, days a freeze kept, today. Back as far as a year. */
export function StreakCalendar() {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const readDays = useUser((s) => s.readDays);
  const covered = useReading((s) => s.freeze.covered);
  const [back, setBack] = useState(0);
  const [dir, setDir] = useState(0);
  const today = localDate();
  const [y, mo] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, mo - 1 - back, 1));
  const firstDay = first.toISOString().slice(0, 10);
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  // Weeks start on Sunday in English, Monday elsewhere.
  const start = lang === 'en' ? 0 : 1;
  const lead = (first.getUTCDay() - start + 7) % 7;
  const read = new Set(readDays);
  const kept = new Set(covered);
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(LOCALE[lang], { ...o, timeZone: 'UTC' });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    fmt(new Date(Date.UTC(2026, 10, 1 + ((start + i) % 7))), { weekday: 'narrow' }),
  );
  const go = (d: number) => {
    setDir(d);
    setBack((b) => b - d);
  };
  return (
    <section className="pf-card cal">
      <header className="cal-head">
        <button
          className="iconbtn"
          type="button"
          aria-label={t('prevMonth')}
          disabled={back >= 11}
          onClick={() => go(-1)}
        >
          <ChevronLeft className="ic" aria-hidden="true" />
        </button>
        <h3>{fmt(first, { month: 'long', year: 'numeric' })}</h3>
        <button
          className="iconbtn"
          type="button"
          aria-label={t('nextMonth')}
          disabled={back === 0}
          onClick={() => go(1)}
        >
          <ChevronRight className="ic" aria-hidden="true" />
        </button>
      </header>
      <div className="cal-grid cal-wd" aria-hidden="true">
        {weekdays.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div key={back} className="cal-grid cal-days" data-dir={dir}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length }, (_, i) => {
          const d = addDays(firstDay, i);
          const state = read.has(d) ? 'read' : kept.has(d) ? 'kept' : d > today ? 'later' : undefined;
          return (
            <span
              key={d}
              className="cal-day"
              data-state={state}
              data-today={d === today || undefined}
              style={{ ['--i' as string]: i }}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      <footer className="cal-key">
        <span>
          <i className="k-read" />
          {t('calRead')}
        </span>
        <span>
          <i className="k-kept" />
          {t('calFrozen')}
        </span>
      </footer>
    </section>
  );
}
