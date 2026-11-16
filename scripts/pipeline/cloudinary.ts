// Cloudinary (free plan) for media that would weigh the repository down: motion-cover clips. Uploads
// are signed here (https://cloudinary.com/documentation/authentication_signatures), so no SDK is
// needed, and clips are served from Cloudinary's CDN with the right video type for every browser.
// Configuration: CLOUDINARY_URL, as the dashboard shows it (cloudinary://<api_key>:<api_secret>@<cloud_name>),
// or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET. Without any, callers keep files in
// public/ as before; a CLOUDINARY_URL that cannot be read stops the run instead of silently doing nothing.
import crypto from 'node:crypto';

/**
 * The account, from CLOUDINARY_URL as the dashboard shows it (also when pasted with its
 * `CLOUDINARY_URL=` prefix, quotes or spaces), or from CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and
 * CLOUDINARY_API_SECRET.
 */
function config() {
  const raw = (process.env.CLOUDINARY_URL || '').trim().replace(/^CLOUDINARY_URL\s*=\s*/i, '').replace(/^["']|["']$/g, '').trim();
  const m = raw.match(/^cloudinary:\/\/([^:\s]+):([^@\s]+)@([^/?\s]+)/);
  if (m) return { key: m[1], secret: m[2], cloud: m[3] };
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (cloud && key && secret) return { key: key.trim(), secret: secret.trim(), cloud: cloud.trim() };
  if (raw) throw new Error('CLOUDINARY_URL is set but is not cloudinary://<api_key>:<api_secret>@<cloud_name>: copy it again from the Cloudinary dashboard');
  return undefined;
}

export const hasCloudinary = () => Boolean(config());

/** True for a URL served from the configured Cloudinary account. */
export const onCloudinary = (url: string | undefined) => {
  const c = config();
  return Boolean(c && url?.startsWith(`https://res.cloudinary.com/${c.cloud}/`));
};

/** Signature of upload parameters: sorted `key=value` pairs joined by `&`, the API secret appended, SHA-1. */
export function signParams(params: Record<string, string | number>, secret: string): string {
  const query = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(query + secret).digest('hex');
}

/** Upload a video under `publicId` (a path without extension) and return its HTTPS URL. */
export async function uploadVideo(body: Buffer, publicId: string): Promise<string> {
  const c = config();
  if (!c) throw new Error('CLOUDINARY_URL is not set');
  const params = { overwrite: 'true', public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, String(v));
  form.append('api_key', c.key);
  form.append('signature', signParams(params, c.secret));
  form.append('file', new Blob([new Uint8Array(body)], { type: 'video/mp4' }), `${publicId.split('/').pop()}.mp4`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloud}/video/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(180_000) });
  const out = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !out.secure_url) throw new Error(`Cloudinary upload ${publicId}: HTTP ${res.status} ${out.error?.message ?? ''}`.trim());
  return out.secure_url;
}
