/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Consume workspace packages as TS source (no separate build step).
  transpilePackages: ['@pmp/core', '@pmp/db'],
  // Keep the postgres driver external to the server bundle.
  serverExternalPackages: ['postgres'],
  // Resolve NodeNext-style `.js` import specifiers to their TS sources.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
