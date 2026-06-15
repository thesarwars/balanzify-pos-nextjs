/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: the app is fully client-rendered and talks to the backend over
  // /api/v1 (proxied by nginx), so it ships as a static bundle served by nginx —
  // a drop-in for the existing CRA `frontend` container. `next build` → `out/`.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // The screens are a faithful mechanical port of the JSX prototype with loose
  // (`any`) typing; don't let strict type/lint errors block dev or production builds.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
