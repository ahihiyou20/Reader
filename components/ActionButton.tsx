'use client';
import { Bookmark, Heart, MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { CountRoll } from '@/components/ui/CountRoll';
import { tap } from '@/lib/haptics';
import { dur, prefersReducedMotion, spring } from '@/lib/motion';
import { animate, useMotionValue } from 'framer-motion';

const ICONS = { like: Heart, save: Bookmark, share: Send, comment: MessageCircle };

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
  const svgRef = useRef<SVGSVGElement>(null);
  const fillSvgRef = useRef<SVGSVGElement>(null);
  const scale = useMotionValue(1);

  useEffect(() => {
    return scale.on('change', (s) => {
      const transform = s === 1 ? '' : `scale(${s})`;
      if (svgRef.current) svgRef.current.style.transform = transform;
      if (fillSvgRef.current) fillSvgRef.current.style.transform = transform;
    });
  }, [scale]);

  const press = () => {
    if (kind === 'like' || kind === 'save') {
      tap();
      if (!prefersReducedMotion()) {
        if (scale.get() > 1.02) {
          animate(scale, 1, spring.pop);
        } else {
          animate(scale, 1.06, {
            ...spring.pop,
            onComplete: () => {
              animate(scale, 1, spring.pop);
            },
          });
        }
      }
    }
    onPress();
  };

  const reduced = prefersReducedMotion();
  const fillStyle =
    kind === 'like'
      ? {
          clipPath: on ? 'circle(100% at 50% 50%)' : 'circle(0% at 50% 50%)',
          transition: reduced ? 'none' : `clip-path ${dur.fill}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }
      : kind === 'save'
        ? {
            clipPath: on ? 'inset(0 0 0% 0)' : 'inset(0 0 100% 0)',
            transition: reduced ? 'none' : `clip-path ${dur.fill}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          }
        : undefined;

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
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon
            ref={svgRef}
            className={`ic${kind === 'comment' ? ' fill' : ''}`}
            strokeWidth={kind === 'share' ? 1.7 : 2}
            aria-hidden="true"
          />
          {(kind === 'like' || kind === 'save') && (
            <Icon
              ref={fillSvgRef}
              className="ic fill"
              strokeWidth={2}
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                ...fillStyle,
              }}
            />
          )}
        </span>
      </button>
      <span className="n" aria-hidden="true">
        <CountRoll value={count} />
      </span>
    </div>
  );
}
