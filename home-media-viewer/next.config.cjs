const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  webpack: function (config, context) {
    config.watchOptions = {
        poll: 5000,
        aggregateTimeout: 1000,
    };

    config.resolve.plugins = [
      new TsconfigPathsPlugin({}),
    ]

    config.resolve.fallback = {
      assert: false,
      buffer: false,
      child_process: false,
      console: false,
      constants: false,
      crypto: false,
      domain: false,
      events: false,
      fs: false,
      http: false,
      https: false,
      net: false,
      os: false,
      path: false,
      punycode: false,
      process: false,
      querystring: false,
      stream: false,
      string_decoder: false,
      sys: false,
      timers: false,
      tls: false,
      tty: false,
      url: false,
      util: false,
      vm: false,
      zlib: false,
    };

    console.log('Webpack config', config);
    
    return config;
  },
  // reactStrictMode: true,
}

module.exports = nextConfig
