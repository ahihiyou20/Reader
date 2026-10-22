'use client';
import { BellRing, ChevronDown, Compass, UserRound } from 'lucide-react';
import { animate } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { displayStreak, localDate } from '@/lib/streak';
import { prefersReducedMotion, spring } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { useT } from '../hooks';
import { Avatar } from './Avatar';

export function TopBar() {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const openOverlay = useUI((s) => s.openOverlay);
  const setLangMenu = useUI((s) => s.setLangMenu);
  const langMenu = useUI((s) => s.langMenu);
  const user = useUser((s) => s.user);
  const name = useUser((s) => s.displayName ?? s.user?.displayName);
  const signedIn = !!user && !user.isAnonymous;

  return (
    <header className="topbar">
      <button
        className="me"
        type="button"
        onClick={() => (signedIn ? openOverlay('profile') : useUI.getState().openSheet({ kind: 'login', reason: 'generic' }))}
        aria-label={signedIn ? t('profile') : t('signIn')}
      >
        {signedIn ? (
          <Avatar name={name} />
        ) : (
          <span className="avatar guest" aria-hidden="true">
            <UserRound className="ic" />
          </span>
        )}
        <span className="uname">{signedIn ? name : t('signIn')}</span>
      </button>
      <StreakBadge onPress={() => openOverlay('profile')} />
      <button className="tb-ic bell" type="button" aria-label={t('notifications')} onClick={() => openOverlay('notifications')}>
        <BellRing className="ic" aria-hidden="true" />
      </button>
      <button className="tb-ic" type="button" aria-label={t('explore')} onClick={() => openOverlay('explore')}>
        <Compass className="ic" aria-hidden="true" />
      </button>
      <button
        className="lang"
        type="button"
        aria-haspopup="menu"
        aria-expanded={langMenu}
        aria-label={t('language')}
        onClick={() => setLangMenu(!langMenu)}
      >
        <span>{lang}</span>
        <ChevronDown className="ic" strokeWidth={2.4} aria-hidden="true" />
      </button>
    </header>
  );
}

/** CMP-02: 🔥 + count; grey until today's reading is done; pops when the streak grows. */
function StreakBadge({ onPress }: { onPress: () => void }) {
  const t = useT();
  const streak = useUser((s) => s.streak);
  const bump = useUser((s) => s.streakBump);
  const { value, readToday } = displayStreak(streak, localDate());
  const fire = useRef<HTMLSpanElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    if (fire.current) animate(fire.current, { scale: [1, 1.35, 1] }, spring.pop);
    num.current?.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], {
      duration: 300,
      easing: 'cubic-bezier(.23,1,.32,1)',
    });
  }, [bump]);
  return (
    <button
      className={`streak${readToday ? '' : ' pending'}`}
      type="button"
      onClick={onPress}
      aria-label={`${t('streakAria', { n: value })}${readToday ? '' : `. ${t('streakPending')}`}`}
    >
      <span className="fire" ref={fire} aria-hidden="true">
        🔥
      </span>
      <span className="snum" aria-hidden="true">
        <span ref={num}>{value}</span>
      </span>
    </button>
  );
}
