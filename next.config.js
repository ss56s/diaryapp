/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Ensure the build process ignores the legacy index.html
  distDir: '.next',
};

module.exports = nextConfig;