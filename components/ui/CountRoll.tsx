'use client';
import { type ReactElement } from 'react';
import { dur, prefersReducedMotion } from '@/lib/motion';

export function CountRoll({ value, className = '' }: { value: number; className?: string }): ReactElement {
  const str = String(value);
  const reduced = prefersReducedMotion();

  return (
    <span
      className={`count-roll ${className}`}
      data-count={value}
      aria-label={str}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      {str.split('').map((char, idx) => {
        const isDigit = char >= '0' && char <= '9';
        if (!isDigit) {
          return (
            <span key={`c-${idx}`} className="char">
              {char}
            </span>
          );
        }
        const digit = parseInt(char, 10);
        return (
          <span
            key={`d-${idx}`}
            className="digit-slot"
            style={{
              display: 'inline-block',
              overflow: 'hidden',
              height: '1.2em',
              lineHeight: '1.2em',
              verticalAlign: 'top',
            }}
          >
            <span
              className="digit-column"
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                transform: `translate3d(0, -${digit * 1.2}em, 0)`,
                transition: reduced ? 'none' : `transform ${dur.count}ms cubic-bezier(0.16, 1, 0.3, 1)`,
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <span
                  key={d}
                  style={{
                    display: 'block',
                    height: '1.2em',
                    lineHeight: '1.2em',
                    textAlign: 'center',
                  }}
                >
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
