import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone build required for Hostinger Node.js hosting deploy target
  // (tech architecture v1.5 §Deploy: web — "รัน Next.js แบบ `standalone` build")
  output: "standalone",
};

export default nextConfig;
