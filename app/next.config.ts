import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  reactStrictMode: true,
  transpilePackages: ["@arcium-hq/client"],
};

export default nextConfig;
