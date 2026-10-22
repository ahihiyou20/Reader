import { Fragment } from 'react';
import type { InlineNode, Rich } from '@/lib/content/types';

const HL = { yellow: 'y', pink: 'p', green: 'g' } as const;

export function Inline({ nodes, onCite }: { nodes: InlineNode[]; onCite?: (refId: string) => void }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <Fragment key={i}>{n.v}</Fragment>;
          case 'bold':
            return <b key={i}>{n.v}</b>;
          case 'italic':
            return <i key={i}>{n.v}</i>;
          case 'hl': {
            const inner = n.bold ? <b>{n.v}</b> : n.italic ? <i>{n.v}</i> : n.v;
            return (
              <span key={i} className={`hl ${HL[n.color]}`}>
                {inner}
              </span>
            );
          }
          case 'cite':
            return (
              <span
                key={i}
                className="cite"
                role="button"
                tabIndex={0}
                data-ref={n.refId}
                onClick={(e) => {
                  e.stopPropagation();
                  onCite?.(n.refId);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCite?.(n.refId);
                  }
                }}
              >
                {n.v}
              </span>
            );
        }
      })}
    </>
  );
}

export function RichText({ rich, onCite }: { rich: Rich | undefined; onCite?: (refId: string) => void }) {
  if (!rich) return null;
  return (
    <>
      {rich.map((p, i) => (
        <p key={i}>
          <Inline nodes={p} onCite={onCite} />
        </p>
      ))}
    </>
  );
}
