import { Brain, Cpu, Globe, HeartPulse, Landmark, Microscope, TrendingUp, Zap, type LucideIcon } from 'lucide-react';


export function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const AV_COLORS = ['#F9A8D4', '#93C5FD', '#FDE68A', '#A7F3D0', '#C4B5FD', '#FDBA74', '#FCA5A5', '#99F6E4'];
export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}

export function initials(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/*
 * Drawn glyphs for streaks and stats (no emoji: they render differently on every platform).
 * Each gradient id carries the glyph's name and a size-independent suffix, so two glyphs of the
 * same kind share identical definitions and a duplicate id is harmless.
 */
type GlyphProps = { size?: number; className?: string };

export function FlameGlyph({ size = 22, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="pm-flame-out" x1="12" y1="2" x2="12" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffb547" />
          <stop offset=".55" stopColor="#ff6a2b" />
          <stop offset="1" stopColor="#e2381f" />
        </linearGradient>
        <linearGradient id="pm-flame-in" x1="12" y1="11" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6c9" />
          <stop offset="1" stopColor="#ffc83d" />
        </linearGradient>
      </defs>
      <path
        fill="url(#pm-flame-out)"
        d="M12.6 1.8c.5 3-1 4.8-2.6 6.6C8.2 10.4 6 12.6 6 16a6 6 0 0 0 12 0c0-2.6-1.2-4.4-2.3-5.8-.3 1.3-1 2.3-2 2.8.6-3.6-.2-8-1.1-11.2Z"
      />
      <path fill="url(#pm-flame-in)" d="M12.3 12.2c.2 1.6-.6 2.5-1.4 3.4-.6.7-1.1 1.4-1.1 2.4a2.2 2.2 0 0 0 4.4 0c0-1.2-.5-2-1-2.6-.1.6-.4 1-.8 1.2.2-1.5 0-3.1-.1-4.4Z" />
    </svg>
  );
}

export function TrophyGlyph({ size = 22, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="pm-gold" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset=".5" stopColor="#f5b83c" />
          <stop offset="1" stopColor="#c47a12" />
        </linearGradient>
      </defs>
      <path fill="none" stroke="url(#pm-gold)" strokeWidth="1.8" strokeLinecap="round" d="M7 5H4.5v1.5A3.5 3.5 0 0 0 8 10M17 5h2.5v1.5A3.5 3.5 0 0 1 16 10" />
      <path fill="url(#pm-gold)" d="M7 3h10v5.5a5 5 0 0 1-10 0V3Zm4 10.3h2V17h-2zM8 18.5c0-.6.4-1 1-1h6c.6 0 1 .4 1 1V21H8v-2.5Z" />
      <path fill="#fff" opacity=".45" d="M9 4.5h1.4v4.2c0 .8.3 1.5.8 2-.1.4-.6.4-1 .1A3.6 3.6 0 0 1 9 8.6V4.5Z" />
    </svg>
  );
}

export function BooksGlyph({ size = 22, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="pm-book-a" x1="4" y1="4" x2="9" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8fd3ff" />
          <stop offset="1" stopColor="#3b7bd9" />
        </linearGradient>
        <linearGradient id="pm-book-b" x1="10" y1="3" x2="14" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffb3a1" />
          <stop offset="1" stopColor="#e2553b" />
        </linearGradient>
        <linearGradient id="pm-book-c" x1="15" y1="5" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c7f0a8" />
          <stop offset="1" stopColor="#4e9e3a" />
        </linearGradient>
      </defs>
      <rect x="3.5" y="5" width="5" height="16" rx="1.2" fill="url(#pm-book-a)" />
      <rect x="9.5" y="3" width="4.5" height="18" rx="1.2" fill="url(#pm-book-b)" />
      <rect x="15.2" y="5.6" width="4.6" height="15.6" rx="1.2" fill="url(#pm-book-c)" transform="rotate(-10 17.5 13.4)" />
      <path stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" strokeLinecap="round" d="M5 8.5h2M10.9 6.5h1.7" />
    </svg>
  );
}

export function BulbGlyph({ size = 18, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id="pm-bulb" cx="12" cy="9" r="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset=".6" stopColor="#ffd84d" />
          <stop offset="1" stopColor="#f2a516" />
        </radialGradient>
      </defs>
      <path fill="url(#pm-bulb)" d="M12 2a7 7 0 0 0-4.2 12.6c.7.5 1.2 1.3 1.2 2.2V18h6v-1.2c0-.9.5-1.7 1.2-2.2A7 7 0 0 0 12 2Z" />
      <path fill="#c9cbd3" d="M9 19h6v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1Z" />
      <path fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.4" strokeLinecap="round" d="M9.2 6.6A3.6 3.6 0 0 1 11.6 5" />
    </svg>
  );
}

export function SparkleGlyph({ size = 18, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="pm-spark" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff3b8" />
          <stop offset="1" stopColor="#ffb547" />
        </linearGradient>
      </defs>
      <path fill="url(#pm-spark)" d="M10 2.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5C7.8 8.4 9.4 6.8 10 2.5Zm8 11c.3 2.2 1.1 3 3.3 3.3-2.2.3-3 1.1-3.3 3.3-.3-2.2-1.1-3-3.3-3.3 2.2-.3 3-1.1 3.3-3.3Z" />
    </svg>
  );
}

const TOPIC: Record<string, [LucideIcon, string]> = {
  psychology: [Brain, '#f29bb8'],
  science: [Microscope, '#7cc8ff'],
  economics: [TrendingUp, '#7fdc9a'],
  society: [Globe, '#6fd3d0'],
  health: [HeartPulse, '#ff7a7a'],
  productivity: [Zap, '#ffd54a'],
  history: [Landmark, '#e6c08a'],
  technology: [Cpu, '#b39dff'],
};

/** A category's icon in its own colour; a category added later without one keeps its emoji. */
export function TopicGlyph({ id, emoji }: { id: string; emoji: string }) {
  const t = TOPIC[id];
  if (!t) return <span aria-hidden="true">{emoji}</span>;
  const [Icon, color] = t;
  return <Icon className="topic-glyph" size={17} strokeWidth={2.2} color={color} aria-hidden="true" />;
}

/** A streak freeze: a faceted ice cube, lit from the top left. `empty` draws the slot it fills. */
export function IceGlyph({ size = 22, className, empty = false }: GlyphProps & { empty?: boolean }) {
  if (empty)
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1.4" strokeDasharray="3 2.4" />
      </svg>
    );
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="pm-ice-body" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e6f7ff" />
          <stop offset=".45" stopColor="#8fd3ff" />
          <stop offset="1" stopColor="#3f8fd8" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="url(#pm-ice-body)" />
      <path d="M7 6.5h6.5a1 1 0 0 1 .7 1.7L8.7 13.7A1 1 0 0 1 7 13V7.5a1 1 0 0 1 1-1Z" fill="rgba(255,255,255,.55)" />
      <path d="M17.2 11.5v4.7a1.8 1.8 0 0 1-1.8 1.8h-4.6" fill="none" stroke="rgba(18,60,110,.35)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="16.4" cy="7.6" r="1.1" fill="#fff" />
    </svg>
  );
}
