import type { NextConfig } from 'next';
import { staticSecurityHeaders } from '@nile/auth/headers';
import { parseEnv } from '@nile/config/env';
import { publicEnvSchemaForApp } from './src/lib/env/public-schema';

// Fail the build (and dev start) when public settings are missing: they are inlined into the bundle now.
parseEnv(publicEnvSchemaForApp, process.env, 'public');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Static security headers on every path (pages, /api/*, assets, the service worker); the per-request CSP
  // comes from proxy.ts. The push service worker is checked for updates on every load (design 01 §15.5).
  headers: () =>
    Promise.resolve([
      {
        source: '/:path*',
        headers: staticSecurityHeaders({ production: process.env.NODE_ENV === 'production' }),
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
        ],
      },
    ]),
  transpilePackages: [
    '@nile/config',
    '@nile/api',
    '@nile/auth',
    '@nile/auth-screens',
    '@nile/domain',
    '@nile/logger',
    '@nile/media',
    '@nile/query',
    '@nile/notifications',
    '@nile/realtime',
    '@nile/support-screens',
    '@nile/ui',
  ],
};

export default nextConfig;
