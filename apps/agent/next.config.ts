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
  // Static security headers on every path (pages, /api/*, assets); the per-request CSP comes from proxy.ts.
  headers: () =>
    Promise.resolve([
      {
        source: '/:path*',
        headers: staticSecurityHeaders({ production: process.env.NODE_ENV === 'production' }),
      },
    ]),
  transpilePackages: [
    '@nile/config',
    '@nile/api',
    '@nile/auth',
    '@nile/auth-screens',
    '@nile/domain',
    '@nile/logger',
    '@nile/query',
    '@nile/notifications',
    '@nile/realtime',
    '@nile/ui',
  ],
  // The push service worker (design 01 §15.5): browsers check it for updates on every load.
  headers: () =>
    Promise.resolve([
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
        ],
      },
    ]),
};

export default nextConfig;
