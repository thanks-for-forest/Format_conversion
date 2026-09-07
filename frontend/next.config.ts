import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 容器部署（切片 7）：standalone 产物自带最小 node_modules，可直接 node server.js
  output: "standalone",
};

export default nextConfig;
