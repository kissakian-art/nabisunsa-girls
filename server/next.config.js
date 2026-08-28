/** @type {import('next').NextConfig} */
module.exports = {
  // Standalone keeps the runtime image small, matching how midway and books
  // are already built on the VPS.
  output: 'standalone',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
};
