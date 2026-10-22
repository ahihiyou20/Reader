// NFR-08 events. Page views come from Cloudflare Web Analytics (no cookies). Custom events go to
// Firebase Analytics only when a measurement id is configured; otherwise they are dropped
// (and printed in development).
import { env } from '@/lib/env';

export type EventName =
  | 'article_view'
  | 'section_view'
  | 'article_complete'
  | 'like'
  | 'save'
  | 'share'
  | 'comment'
  | 'streak_up'
  | 'lang_switch'
  | 'apply_done'
  | 'search'
  | 'sign_in'
  | 'submit_post';

type Payload = Record<string, string | number | boolean | undefined>;
let sink: ((name: EventName, p: Payload) => void) | null = null;
let loading = false;
const queue: Array<[EventName, Payload]> = [];

export function track(name: EventName, payload: Payload = {}) {
  if (process.env.NODE_ENV === 'development') console.debug('[analytics]', name, payload);
  if (!env.firebase.measurementId || !env.firebase.apiKey) return;
  if (sink) return sink(name, payload);
  queue.push([name, payload]);
  if (loading) return;
  loading = true;
  Promise.all([import('firebase/app'), import('firebase/analytics')])
    .then(async ([{ getApps, getApp }, a]) => {
      if (!(await a.isSupported())) return;
      // The backend creates the default app; wait for it instead of creating a second one.
      for (let i = 0; i < 50 && !getApps().length; i++) await new Promise((r) => setTimeout(r, 200));
      if (!getApps().length) return;
      const analytics = a.getAnalytics(getApp());
      sink = (n, p) => a.logEvent(analytics, n as string, p);
      for (const [n, p] of queue.splice(0)) sink(n, p);
    })
    .catch(() => {});
}
