'use client';
import { Bookmark, Heart, MessageCircle, Send } from 'lucide-react';
import { useRef } from 'react';
import { formatCount } from '@/lib/format';
import { prefersReducedMotion } from '@/lib/motion';

const ICONS = { like: Heart, save: Bookmark, share: Send, comment: MessageCircle };
const FILLED = new Set(['like', 'save', 'comment']);

export function ActionButton({
  kind,
  size,
  count,
  on,
  label,
  onPress,
}: {
  kind: 'like' | 'save' | 'share' | 'comment';
  size: 'lg' | 'md';
  count: number;
  on?: boolean;
  label: string;
  onPress: () => void;
}) {
  const Icon = ICONS[kind];
  const ref = useRef<HTMLButtonElement>(null);
  const press = () => {
    const el = ref.current?.firstElementChild as HTMLElement | null;
    if (el && !prefersReducedMotion()) {
      if (kind === 'like' && !on)
        el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], {
          duration: 340,
          easing: 'cubic-bezier(.34,1.56,.64,1)',
        });
      if (kind === 'save' && !on)
        el.animate([{ transform: 'translateY(-3px)' }, { transform: 'none' }], { duration: 150, easing: 'cubic-bezier(.23,1,.32,1)' });
    }
    onPress();
  };
  return (
    <div className={`act ${size} ${kind}${on ? ' on' : ''}`}>
      <button
        ref={ref}
        className="cb"
        type="button"
        aria-label={label}
        aria-pressed={kind === 'like' || kind === 'save' ? Boolean(on) : undefined}
        onClick={press}
      >
        <Icon className={`ic${FILLED.has(kind) ? ' fill' : ''}`} strokeWidth={kind === 'share' ? 1.7 : 2} aria-hidden="true" />
      </button>
      <span className="n" aria-hidden="true">
        {formatCount(count)}
      </span>
    </div>
  );
}
