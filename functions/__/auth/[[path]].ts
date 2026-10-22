// Cloudflare Pages Function: serves Firebase Auth's /__/auth/* handler from the app's own domain,
// so sign-in with redirect works in Safari and installed PWAs, which block third-party storage
// (docs/07 §3.4). Set FIREBASE_PROJECT_ID in the Pages project's environment variables.
interface Env {
  FIREBASE_PROJECT_ID?: string;
}

interface Context {
  request: Request;
  env: Env;
}

export const onRequest = async ({ request, env }: Context): Promise<Response> => {
  const project = env.FIREBASE_PROJECT_ID;
  if (!project) return new Response('FIREBASE_PROJECT_ID is not set', { status: 500 });
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, `https://${project}.firebaseapp.com`);
  const upstream = await fetch(new Request(target.toString(), request));
  // Pass the response through unchanged (the handler sets its own caching and security headers).
  return new Response(upstream.body, upstream);
};
