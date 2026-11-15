'use client';
import { useEffect, useRef, useState } from 'react';
import type { CoverClient } from '@/lib/content/types';
import { COVER_SIZES, type OptCover } from '@/lib/covers';
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
  const [decoded, setDecoded] = useState(Boolean(priority));
  const video = useRef<HTMLVideoElement>(null);
  const img = useRef<HTMLImageElement>(null);

  const shouldDecode = Boolean(priority || active || playing || blurred);
  const landscape = useUI((s) => s.stage.endsWith('landscape'));
  const still = useReducedMotion();
  // The landscape file is sharp on wide screens; phones keep the smaller portrait one.
  const wide = landscape ? cover.wide : undefined;
  const clip = cover.video && !blurred && !still && (active || playing) && !saveData() ? (landscape && cover.video.wide) || cover.video.url : undefined;

  useEffect(() => {
    if (!shouldDecode || decoded) return;
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
  }, [shouldDecode, decoded]);

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
  const src = wide ?? opt?.src ?? (cover.type === 'video' ? cover.poster ?? cover.blurDataURL : cover.url);
  if (!src) return placeholder;
  return (
    <>
      {placeholder}
      <img
        ref={img}
        className={`media${decoded ? '' : ' loading'}`}
        src={src}
        srcSet={wide ? undefined : opt?.srcSet}
        sizes={opt && !wide ? COVER_SIZES : undefined}
        alt=""
        decoding="async"
        draggable={false}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={() => {
          if (!shouldDecode) return;
          const el = img.current;
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

/** The reader asked the browser to save data: keep to the still image. */
const saveData = () => typeof navigator !== 'undefined' && Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
