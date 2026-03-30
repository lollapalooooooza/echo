/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // Vercel serverless function config
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"],
  },
  // Suppress build warnings for optional dependencies
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false, child_process: false };
    return config;
  },
};
