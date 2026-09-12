/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600
  },
  // Development and production must never share generated chunks. Replacing a
  // running dev server's build directory leaves its HTML pointing at deleted CSS.
  distDir: process.env.NEXT_DIST_DIR
    || (process.env.NODE_ENV === "development" ? ".next-development" : ".next-production")
};

export default nextConfig;
