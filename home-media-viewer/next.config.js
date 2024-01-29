
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: function (config, context) {
    config.watchOptions = {
        poll: 5000,
        aggregateTimeout: 1000,
        ignored: /node_modules/,
    };
    return config;
  },
  eslint: {
    dirs: [ 'src', '__tests__' ]
  },
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
