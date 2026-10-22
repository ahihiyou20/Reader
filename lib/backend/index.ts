import { firebaseConfigured } from '@/lib/env';
import type { Backend } from './types';

let promise: Promise<Backend> | null = null;

/** The Firebase SDK is code-split and only loaded when the site is configured for it. */
export function getBackend(): Promise<Backend> {
  if (!promise) {
    promise = firebaseConfigured
      ? import('./firebase').then((m) => m.createFirebaseBackend())
      : import('./local').then((m) => m.createLocalBackend());
  }
  return promise;
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
