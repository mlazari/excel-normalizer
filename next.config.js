/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: config => {
    config.module.rules.push({
      test: /\.node?$/i,
      use: 'null-loader',
    });
    return config;
  }
}

module.exports = nextConfig
