/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        // Allow version query strings used to refresh regenerated thumbnails.
        localPatterns: [{ pathname: '/api/file/thumbnail/**' }],
    },
    webpack: function (config) {
        config.watchOptions = {
            poll: 5000,
            aggregateTimeout: 1000,
            ignored: /node_modules/,
        };
        return config;
    },
    reactStrictMode: true,
};

module.exports = nextConfig;
