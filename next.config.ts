import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Univer must never be imported into server rendering code. Pages that mount
  // the editor load it through next/dynamic with ssr: false.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
