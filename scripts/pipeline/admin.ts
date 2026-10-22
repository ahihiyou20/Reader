// Firebase Admin for GitHub Actions jobs. Credentials come from the FIREBASE_SERVICE_ACCOUNT_JSON secret;
// with FIRESTORE_EMULATOR_HOST set, the emulator is used instead.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function admin() {
  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-reader' });
    else {
      const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
      const sa = JSON.parse(json);
      initializeApp({ credential: cert(sa), projectId: sa.project_id });
    }
  }
  return { db: getFirestore(), auth: getAuth() };
}

export const hasAdminCredentials = () => Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIRESTORE_EMULATOR_HOST);
