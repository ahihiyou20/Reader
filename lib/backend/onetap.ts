// Google One Tap (Google Identity Services) for Chrome and Android: docs/07 §3.3.
import { env } from '@/lib/env';

interface GsiCredentialResponse {
  credential: string;
}
interface GsiNotification {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
}
interface Gsi {
  accounts: {
    id: {
      initialize(opts: Record<string, unknown>): void;
      prompt(cb?: (n: GsiNotification) => void): void;
      cancel(): void;
    };
  };
}

let loading: Promise<Gsi | null> | null = null;

function loadGsi(): Promise<Gsi | null> {
  if (!env.googleClientId) return Promise.resolve(null);
  if (!loading) {
    loading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve((window as unknown as { google?: Gsi }).google ?? null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** Shows One Tap. Resolves with an ID token, or null when One Tap is unavailable or dismissed. */
export async function promptOneTap(): Promise<string | null> {
  const gsi = await loadGsi();
  if (!gsi) return null;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: string | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    gsi.accounts.id.initialize({
      client_id: env.googleClientId,
      callback: (r: GsiCredentialResponse) => finish(r.credential),
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: true,
      context: 'signin',
      itp_support: true,
    });
    gsi.accounts.id.prompt((n) => {
      if (n.isNotDisplayed() || n.isSkippedMoment()) finish(null);
    });
    setTimeout(() => finish(null), 60_000);
  });
}

export function cancelOneTap() {
  (window as unknown as { google?: Gsi }).google?.accounts.id.cancel();
}
