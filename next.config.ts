import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server for the web container (see Dockerfile.web).
  output: "standalone",
  serverExternalPackages: ["pg", "openid-client"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
