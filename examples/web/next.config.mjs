/** @type {import('next').NextConfig} */
const config = {
  // Keep normal builds offline. Run pnpm audit explicitly; never hide its findings.
  experimental: { agentUpgrade: false },
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    '@korea-map-kit/core',
    '@korea-map-kit/web',
    '@korea-map-kit/styles',
    '@korea-map-kit/data-adapters',
  ],
};
export default config;
