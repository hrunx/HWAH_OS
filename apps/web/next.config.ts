import type { NextConfig } from "next";
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@pa-os/db", "@pa-os/agents", "@pa-os/ui"],
};

export default nextConfig;
