import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// Static export: the whole app is plain files on Cloudflare Pages (docs/06 §1).
const nextConfig = (phase: string): NextConfig => ({
  output: 'export',
  // `next dev` keeps its files apart from `next build`: a build run while the dev server is up used to
  // overwrite the server's chunks and leave it answering 500.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  eslint: { dirs: ['app', 'components', 'lib', 'stores', 'scripts', 'tests'] },
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? 'dev',
  },
});

export default nextConfig;
