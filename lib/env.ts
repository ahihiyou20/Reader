export const env = {
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
  },
  recaptchaSiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '',
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  useEmulators: process.env.NEXT_PUBLIC_USE_EMULATORS === 'true',
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reader-xtm.pages.dev').replace(/\/$/, ''),
  repo: process.env.NEXT_PUBLIC_REPO ?? 'ahihiyou20/Reader',
  repoBranch: process.env.NEXT_PUBLIC_REPO_BRANCH ?? 'main',
  /** Google Search Console "HTML tag" token: proves the domain for the OAuth consent screen. */
  googleSiteVerification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? '',
  cfAnalyticsToken: process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN ?? '',
  buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev',
};

export const firebaseConfigured = Boolean(env.firebase.apiKey && env.firebase.projectId && env.firebase.appId);
