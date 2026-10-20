/** @type {import('next').NextConfig} */
const config = {
  // Keep normal builds offline. Run pnpm audit explicitly; never hide its findings.
  experimental: { agentUpgrade: false },
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    '@korea-map-kit/example-scenarios',
    'korea-map-core',
    'korea-map-web',
    'korea-map-styles',
    'korea-map-data-adapters',
  ],
};
export default config;
