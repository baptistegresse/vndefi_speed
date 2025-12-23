import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "./app/generated/prisma/*.node",
      "./app/generated/prisma/*.so.node",
      "./node_modules/.prisma/client/*.node",
    ],
  },
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
