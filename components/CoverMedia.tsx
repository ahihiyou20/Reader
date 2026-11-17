'use client';
import { useEffect, useRef, useState } from 'react';
import type { CoverClient } from '@/lib/content/types';
import { COVER_SIZES, type OptCover } from '@/lib/covers';
import { isDecoded } from '@/lib/data';
import { useUI } from '@/stores/ui';
import { useReducedMotion } from './hooks';

/** Full-bleed cover image or muted looping video (FR-02). */
export function CoverMedia({
  cover,
  playing,
  priority,
  blurred,
  active,
  opt,
}: {
  cover: CoverClient;
  opt?: OptCover;
  playing?: boolean;
  priority?: boolean;
  blurred?: boolean;
  active?: boolean;
}) {
  const landscape = useUI((s) => s.stage.endsWith('landscape'));
  const wanted = coverSource(cover, opt, landscape);
  // Turning the phone swaps in the other shape of the cover: keep showing the current file until the
  // new one is decoded, so the screen never goes dark while it loads.
  const [source, setSource] = useState(wanted);
  useEffect(() => {
    if (wanted.src === source.src) return;
    let live = true;
    const next = new Image();
    if (wanted.srcSet) {
      next.sizes = wanted.sizes ?? '';
      next.srcset = wanted.srcSet;
    }
    next.src = wanted.src ?? '';
    next
      .decode()
      .catch(() => {})
      .then(() => live && setSource(wanted));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wanted is rebuilt each render; its src is what changes
  }, [wanted.src, source.src]);
  // With a srcset, a resize or rotation makes the browser pick another file, and the <img> is empty
  // while it loads (it happens before React hears of the resize). The last file it showed stays
  // underneath: it is in the cache, so this costs no download. Only the cover on screen keeps one.
  const [backdrop, setBackdrop] = useState<string>();
  const keepsBackdrop = Boolean(playing && source.srcSet && !blurred);
  useEffect(() => setBackdrop(keepsBackdrop ? img.current?.currentSrc || undefined : undefined), [keepsBackdrop]);
  // A cover the feed already preloaded shows at once instead of fading in.
  const [decoded, setDecoded] = useState(() => Boolean(priority) || isDecoded(source.src));
  const video = useRef<HTMLVideoElement>(null);
  const img = useRef<HTMLImageElement>(null);

  const shouldDecode = Boolean(priority || active || playing || blurred);
  const still = useReducedMotion();
  const wantClip = cover.video && !blurred && !still && (active || playing) && !saveData() ? (landscape && cover.video.wide) || cover.video.url : undefined;
  // The clip's shape is chosen when it starts: swapping it on rotation would remount the <video>, and
  // the new one fades in from nothing over a frame or two of bare background.
  const chosen = useRef<string | undefined>(undefined);
  if (!wantClip) chosen.current = undefined;
  else if (!chosen.current || ![cover.video?.url, cover.video?.wide].includes(chosen.current)) chosen.current = wantClip;
  const clip = chosen.current;

  useEffect(() => {
    if (decoded) return;
    const el = img.current;
    if (!el) return;

    let cancelled = false;
    const markDecoded = () => {
      if (!cancelled) setDecoded(true);
    };

    if (el.complete && el.naturalWidth) {
      if ('decode' in el) {
        el.decode().then(markDecoded).catch(markDecoded);
      } else {
        markDecoded();
      }
    }
    return () => {
      cancelled = true;
    };
  }, [decoded]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing]);

  const placeholder = cover.blurDataURL ? (
    <div className="media-blur" style={{ backgroundImage: `url(${cover.blurDataURL})` }} aria-hidden="true" />
  ) : null;

  // The blurred Details layer reuses the poster/image (already cached) instead of decoding the video twice.
  if (cover.type === 'video' && !blurred) {
    return (
      <>
        {placeholder}
        <video
          ref={video}
          className={`media${decoded ? '' : ' loading'}`}
          src={cover.url}
          poster={cover.poster}
          muted
          loop
          playsInline
          preload={priority ? 'auto' : 'metadata'}
          onLoadedData={() => {
            if (shouldDecode) setDecoded(true);
          }}
          aria-hidden="true"
        />
      </>
    );
  }
  const { src, srcSet, sizes } = source;
  if (!src) return placeholder;
  return (
    <>
      {placeholder}
      {backdrop && <img className="media media-backdrop" src={backdrop} alt="" aria-hidden="true" draggable={false} />}
      <img
        ref={img}
        // Covers without a clip drift slowly while on screen. The animation stays on and only pauses
        // off screen: adding or removing it made the picture jump in scale as a swipe landed.
        className={`media${decoded ? '' : ' loading'}${!clip && !blurred ? ' drift' : ''}`}
        style={!clip && !blurred ? { animationPlayState: playing ? 'running' : 'paused' } : undefined}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt=""
        decoding="async"
        draggable={false}
        // Only the pages next to the current one are mounted, and they must be ready before the swipe lands.
        loading="eager"
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={() => {
          const el = img.current;
          if (el?.currentSrc && keepsBackdrop) setBackdrop(el.currentSrc);
          if (el && 'decode' in el) {
            el.decode().then(() => setDecoded(true)).catch(() => setDecoded(true));
          } else {
            setDecoded(true);
          }
        }}
      />
      {clip && <video ref={video} key={clip} className="media media-clip" src={clip} muted loop playsInline autoPlay preload="auto" aria-hidden="true" />}
    </>
  );
}

/** The file an <img> cover loads, shared with the feed's preloading so both fetch the same URL. */
export function coverSource(cover: CoverClient, opt: OptCover | undefined, landscape: boolean) {
  // The landscape file is sharp on wide screens; phones keep the smaller portrait one.
  const wide = landscape ? cover.wide : undefined;
  const src = wide ?? opt?.src ?? (cover.type === 'video' ? cover.poster ?? cover.blurDataURL : cover.url);
  return { src, srcSet: wide ? undefined : opt?.srcSet, sizes: opt && !wide ? COVER_SIZES : undefined };
}

/** The reader asked the browser to save data: keep to the still image. */
const saveData = () => typeof navigator !== 'undefined' && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
