'use client';
import { useEffect, useRef, useState } from 'react';
import type { CoverClient } from '@/lib/content/types';

/** Full-bleed cover image or muted looping video (FR-02). */
export function CoverMedia({
  cover,
  playing,
  priority,
  blurred,
}: {
  cover: CoverClient;
  playing?: boolean;
  priority?: boolean;
  blurred?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth) setLoaded(true);
  }, []);

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
          className={`media${loaded ? '' : ' loading'}`}
          src={cover.url}
          poster={cover.poster}
          muted
          loop
          playsInline
          preload={priority ? 'auto' : 'metadata'}
          onLoadedData={() => setLoaded(true)}
          aria-hidden="true"
        />
      </>
    );
  }
  const src = cover.type === 'video' ? cover.poster ?? cover.blurDataURL : cover.url;
  if (!src) return placeholder;
  return (
    <>
      {placeholder}
      <img
        ref={img}
        className={`media${loaded ? '' : ' loading'}`}
        src={src}
        alt=""
        decoding="async"
        draggable={false}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        onLoad={() => setLoaded(true)}
      />
    </>
  );
}
