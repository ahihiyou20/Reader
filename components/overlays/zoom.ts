import { animate } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/motion';

const cover = (slug?: string) =>
  document.querySelector<HTMLElement>(`section.article${slug ? `[data-slug="${CSS.escape(slug)}"]` : '[data-active="true"]'} .layer.sharp`);

/** The picture a card shows right now, as an element the ghost can hold: a frame of its clip, or its photo. */
function snapshot(card: HTMLElement): HTMLElement | undefined {
  const media = card.querySelector('video, img');
  if (media instanceof HTMLVideoElement && media.readyState >= 2) {
    const c = document.createElement('canvas');
    c.width = media.videoWidth;
    c.height = media.videoHeight;
    c.getContext('2d')?.drawImage(media, 0, 0);
    return c;
  }
  if (media instanceof HTMLImageElement && media.complete && media.naturalWidth) {
    const i = document.createElement('img');
    i.src = media.currentSrc || media.src;
    i.alt = '';
    return i;
  }
}

/**
 * Opening an article from a card, the way macOS restores a minimised window: the card's picture grows
 * from where it sits into the article's cover, then gives way to the cover itself once that has loaded.
 * The ghost always shows the picture cropped to cover its current box, as the card and the cover both
 * do, so the crop changes smoothly from the card's shape to the screen's. Call it before the feed
 * switches: the cover on screen now tells where the new one will sit.
 */
export function zoomOpen(card: HTMLElement, slug: string) {
  if (prefersReducedMotion()) return;
  const pic = snapshot(card);
  if (!pic) return;
  const from = card.getBoundingClientRect();
  const to = cover()?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
  const ghost = document.createElement('div');
  ghost.className = 'zoom-ghost';
  Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
  ghost.append(pic);
  const frame = (p: number) => {
    const w = from.width + (to.width - from.width) * p;
    const h = from.height + (to.height - from.height) * p;
    const cx = from.left + from.width / 2 + (to.left + to.width / 2 - from.left - from.width / 2) * p;
    const cy = from.top + from.height / 2 + (to.top + to.height / 2 - from.top - from.height / 2) * p;
    const s = Math.max(w / to.width, h / to.height);
    ghost.style.transform = `translate(${cx - to.left - to.width / 2}px, ${cy - to.top - to.height / 2}px) scale(${s})`;
    ghost.style.clipPath = `inset(${(to.height - h / s) / 2}px ${(to.width - w / s) / 2}px round ${(radius * (1 - p)) / s}px)`;
  };
  frame(0);
  document.body.append(ghost);
  const leave = () =>
    ghost
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' })
      .finished.finally(() => ghost.remove());
  animate(0, 1, {
    type: 'spring',
    bounce: 0,
    duration: 0.55,
    onUpdate: frame,
    onComplete: () => {
      // Hand over once the article's own cover has its picture, or after 700 ms whatever happens.
      const t0 = performance.now();
      const wait = () => {
        const ready = cover(slug)?.querySelector('.media:not(.loading)');
        if (ready || performance.now() - t0 > 700) leave();
        else requestAnimationFrame(wait);
      };
      wait();
    },
  });
}
