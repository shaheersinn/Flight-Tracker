/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@flight-tracker/shared"],
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

module.exports = nextConfig;
