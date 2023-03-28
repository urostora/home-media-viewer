/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: function (config, context) {
    config.watchOptions = {
        poll: 5000,
        aggregateTimeout: 1000,
    };
    return config;
  },
  reactStrictMode: true,
}

module.exports = nextConfig
