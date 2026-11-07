import { firebaseConfigured } from '@/lib/env';
import type { Backend } from './types';

let promise: Promise<Backend> | null = null;
const onStart: Array<() => void> = [];

/**
 * The backend (Firebase, with its auth, Firestore cache and App Check) is the heaviest script on the
 * page, so it starts only when the reader needs it: a tap on something that reads or writes their
 * data, a pending sign-in redirect, or a quiet moment well after the first paint (ReaderApp).
 * Every caller goes through here; the first call starts it and marks 'reader:backend-start'.
 */
export function getBackend(): Promise<Backend> {
  if (!promise) {
    performance.mark('reader:backend-start');
    promise = firebaseConfigured
      ? import('./firebase').then((m) => m.createFirebaseBackend())
      : import('./local').then((m) => m.createLocalBackend());
    queueMicrotask(() => onStart.splice(0).forEach((fn) => fn()));
  }
  return promise;
}

export const backendStarted = () => promise !== null;

/** Run `fn` once, when the backend starts (right away if it already has). */
export function onBackendStart(fn: () => void) {
  if (promise) queueMicrotask(fn);
  else onStart.push(fn);
}

export const backendKind = firebaseConfigured ? 'firebase' : 'local';

export function isInAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Zalo|ZaloTheme|Line\/|musical_ly|BytedanceWebview|TikTok|Snapchat|MicroMessenger|KAKAOTALK|GSA\//i.test(ua);
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** docs/07 §3.3: popups are unreliable in iOS Safari and installed PWAs, so those use redirect. */
export function preferRedirect(): boolean {
  return isIOS() || isStandalone();
}

export function isChromeLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Chrome\/|CriOS\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent) && !isIOS();
}
