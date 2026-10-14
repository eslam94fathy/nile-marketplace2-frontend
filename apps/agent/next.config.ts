import type { NextConfig } from 'next';
import { parseEnv } from '@nile/config/env';
import { publicEnvSchemaForApp } from './src/lib/env/public-schema';

// Fail the build (and dev start) when public settings are missing: they are inlined into the bundle now.
parseEnv(publicEnvSchemaForApp, process.env, 'public');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: [
    '@nile/config',
    '@nile/api',
    '@nile/auth',
    '@nile/auth-screens',
    '@nile/domain',
    '@nile/logger',
    '@nile/query',
    '@nile/ui',
  ],
};

export default nextConfig;
