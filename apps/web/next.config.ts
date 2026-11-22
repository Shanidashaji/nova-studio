import path from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

// One .env at the repository root serves every package (locally; Vercel injects env vars itself).
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

/**
 * The NestJS API runs inside this app: `src/pages/api/[...path].ts` hands every /api/* request
 * to it (ADR-0014), so the browser talks to one origin and the product deploys as one Vercel
 * project. Set API_INTERNAL_URL only to send /api/* to a separately running API instead
 * (e.g. `pnpm --filter @nova/api start` while debugging the API on its own).
 */
const externalApi = process.env.API_INTERNAL_URL?.trim();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The development badge sits bottom-left, exactly over the Home tab of the phone layout.
  devIndicators: false,
  // Lets a verification build run beside a live `next start` (OneDrive locks .next while in use).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // The monorepo root, so output tracing includes the workspace packages the API needs.
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  // The API route loads `@nova/api`'s compiled output (`nest build` has already emitted the
  // decorator metadata, so nothing here needs to understand decorators). Nest, Mongoose and the
  // MongoDB driver stay external Node packages, traced into the function rather than bundled,
  // because they resolve optional modules at runtime.
  serverExternalPackages: ['@nova/api'],
  async rewrites() {
    if (!externalApi) return [];
    // beforeFiles: takes precedence over the built-in pages/api route.
    return { beforeFiles: [{ source: '/api/:path*', destination: `${externalApi}/api/:path*` }] };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
