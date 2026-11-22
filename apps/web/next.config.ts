import path from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

// One .env at the repository root serves every package.
config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The development badge sits bottom-left, exactly over the Home tab of the phone layout.
  devIndicators: false,
  // Lets a verification build run beside a live `next start` (OneDrive locks .next while in use).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // The browser talks only to Next.js; /api/* is forwarded to the NestJS API (ADR-0002),
  // which keeps the session cookie first-party and avoids CORS entirely.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
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
        ],
      },
    ];
  },
};

export default nextConfig;
