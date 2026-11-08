import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The browser editor loads Univer through next/dynamic with ssr: false, so
  // Univer UI code never runs during server rendering. Route handlers run the
  // headless Univer packages (no DOM) to recalculate saved workbooks; keep those
  // packages external so Node loads them as published instead of bundling them.
  serverExternalPackages: [
    '@univerjs/core',
    '@univerjs/engine-formula',
    '@univerjs/sheets',
    '@univerjs/sheets-formula',
  ],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
