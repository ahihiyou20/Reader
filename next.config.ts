import type { NextConfig } from 'next';

// Static export: the whole app is plain files on Cloudflare Pages (docs/06 §1).
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  eslint: { dirs: ['app', 'components', 'lib', 'stores', 'scripts', 'tests'] },
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? 'dev',
  },
};

export default nextConfig;
