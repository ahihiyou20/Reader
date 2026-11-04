'use client';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ArticleClient } from '@/lib/content/types';
import { setApplyStep } from '@/lib/actions';
import { tap } from '@/lib/haptics';
import { pick } from '@/lib/i18n';
import { prefersReducedMotion } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { useT } from '../hooks';

export function ApplyCard({ article }: { article: ArticleClient }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const steps = pick(article.applySteps, lang) ?? [];
  const done = useUser((s) => s.progress[article.slug]?.applyDone);
  const [burst, setBurst] = useState(0);
  const prevAll = useRef(false);

  const all = steps.length > 0 && steps.every((_, i) => done?.[i]);

  useEffect(() => {
    if (all && !prevAll.current) {
      const cta = document.querySelector('.view.engage .cta') || document.querySelector('.cta');
      if (cta) {
        cta.classList.remove('glow');
        void (cta as HTMLElement).offsetWidth;
        cta.classList.add('glow');
      }
    }
    prevAll.current = Boolean(all);
  }, [all]);

  if (!steps.length) return null;

  return (
    <div className="apply">
      <h3 data-region="engage-apply">{t('applyTitle')}</h3>
      <p className="asub">{t('applySub')}</p>
      {steps.map((s, i) => (
        <button
          key={i}
          className="step"
          type="button"
          aria-pressed={Boolean(done?.[i])}
          onClick={async () => {
            tap();
            if (await setApplyStep(article.slug, i, !done?.[i])) setBurst((b) => b + 1);
          }}
        >
          <span className="chk">
            <svg
              className="ic"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" pathLength="24" />
            </svg>
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
