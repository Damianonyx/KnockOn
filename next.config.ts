import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The browser editor loads Univer through next/dynamic with ssr: false, so
  // Univer UI code never runs during server rendering. Route handlers run the
  // headless Univer packages (no DOM) to recalculate saved workbooks. Those are
  // bundled, not external: Univer publishes ES modules without "type": "module",
  // which Vercel's Node runtime refuses to load directly.
  serverExternalPackages: [
    // Database drivers: node-postgres for hosted Postgres, PGlite (WebAssembly) locally.
    'pg',
    '@electric-sql/pglite',
  ],
  typescript: { ignoreBuildErrors: false },
  // Do not write an AGENTS.md into the repository when the dev server starts.
  agentRules: false,
};

export default nextConfig;
