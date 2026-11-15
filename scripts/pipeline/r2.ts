// Cloudflare R2 for media that would weigh the repository down (motion-cover clips). R2 speaks the S3
// API; requests are signed here with AWS Signature V4 so no SDK is needed.
// Configuration: R2_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (an R2
// API token with Object Read & Write), R2_BUCKET, and R2_PUBLIC_URL, the bucket's public address
// (its r2.dev URL or a custom domain). Without them, callers keep files in public/ as before.
import crypto from 'node:crypto';

const env = () => ({
  account: process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '',
  keyId: process.env.R2_ACCESS_KEY_ID || '',
  secret: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/$/, ''),
});

export const hasR2 = () => Object.values(env()).every(Boolean);

/** Address readers fetch an object from. */
export const r2PublicUrl = (key: string) => `${env().publicUrl}/${key}`;

/** True for a URL served from the configured bucket. */
export const onR2 = (url: string | undefined) => Boolean(url && env().publicUrl && url.startsWith(`${env().publicUrl}/`));

const sha256 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => crypto.createHmac('sha256', key).update(data).digest();

export interface SignInput {
  method: string;
  host: string;
  /** URI-encoded path, starting with "/". */
  path: string;
  /** Headers to sign besides host; names in any case. */
  headers: Record<string, string>;
  payloadHash: string;
  keyId: string;
  secret: string;
  region: string;
  service: string;
  /** YYYYMMDDTHHMMSSZ */
  amzDate: string;
}

/** The Authorization header of an AWS Signature V4 request (no query string). */
export function signV4(r: SignInput): string {
  const all = Object.entries({ ...r.headers, host: r.host }).map(([k, v]) => [k.toLowerCase(), v.trim()] as const);
  all.sort(([a], [b]) => a.localeCompare(b));
  const signed = all.map(([k]) => k).join(';');
  const canonical = [r.method, r.path, '', ...all.map(([k, v]) => `${k}:${v}`), '', signed, r.payloadHash].join('\n');
  const date = r.amzDate.slice(0, 8);
  const scope = `${date}/${r.region}/${r.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', r.amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${r.secret}`, date), r.region), r.service), 'aws4_request');
  return `AWS4-HMAC-SHA256 Credential=${r.keyId}/${scope}, SignedHeaders=${signed}, Signature=${crypto.createHmac('sha256', key).update(toSign).digest('hex')}`;
}

/** Upload one object and return its public URL. Keys are never reused, so the object can be cached for a year. */
export async function r2Put(key: string, body: Buffer, contentType: string): Promise<string> {
  const c = env();
  if (!hasR2()) throw new Error('R2 is not configured');
  const host = `${c.account}.r2.cloudflarestorage.com`;
  const path = `/${c.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const payloadHash = sha256(body);
  const headers = { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable', 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const authorization = signV4({ method: 'PUT', host, path, headers, payloadHash, keyId: c.keyId, secret: c.secret, region: 'auto', service: 's3', amzDate });
  const res = await fetch(`https://${host}${path}`, { method: 'PUT', headers: { ...headers, authorization }, body: new Uint8Array(body), signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`R2 PUT ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return r2PublicUrl(key);
}
