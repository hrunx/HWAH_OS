import type { NextConfig } from "next";
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@pa-os/db", "@pa-os/agents", "@pa-os/ui"],
  experimental: {
    webpackMemoryOptimizations: true,
  },
  turbopack: {
    // Prevent Next from incorrectly inferring the workspace root when multiple lockfiles exist above this repo.
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
