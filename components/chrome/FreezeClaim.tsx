'use client';
import { AnimatePresence, m } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { claimFreeze, guardStreak } from '@/lib/actions';
import { spring } from '@/lib/motion';
import { localDate } from '@/lib/streak';
import { canClaimFreeze, useReading } from '@/stores/reading';
import { useUI } from '@/stores/ui';
import { useReducedMotion, useT } from '../hooks';
import { IceGlyph } from '../icons';

/**
 * Five minutes read today: a glass pill drops in under the top bar with the day's streak freeze to
 * take. It stays until taken or set aside (for the day; the Profile still offers it). Also spends
 * held freezes when the app comes back on a later day.
 */
export function FreezeClaim() {
  const t = useT();
  const still = useReducedMotion();
  const day = localDate();
  const claimable = useReading((s) => canClaimFreeze(s, day));
  const profileOpen = useUI((s) => s.overlays.includes('profile'));
  const [setAside, setSetAside] = useState<string | null>(null);

  useEffect(() => {
    const back = () => document.visibilityState === 'visible' && void guardStreak();
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);

  const shown = claimable && setAside !== day && !profileOpen;
  return (
    <AnimatePresence>
      {shown && (
        <m.div
          className="fclaim glass"
          role="status"
          initial={still ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={still ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
          transition={still ? { duration: 0.15 } : spring.sheet}
        >
          <IceGlyph size={30} />
          <span className="fclaim-t">
            <b>{t('freezeReady')}</b>
            <span>{t('freezeTitle')}</span>
          </span>
          <button className="fz-claim" type="button" onClick={claimFreeze}>
            {t('freezeClaim')}
          </button>
          <button className="iconbtn" type="button" aria-label={t('close')} onClick={() => setSetAside(day)}>
            <X className="ic" aria-hidden="true" />
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
