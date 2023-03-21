/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: function (config, context) {
    config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
    };
    return config;
  },
  reactStrictMode: true,
}

module.exports = nextConfig
