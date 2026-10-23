import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 기록 규칙 문서를 /api/mcp 서버 묶음에 포함시킨다(배포 환경에서도 파일을 읽을 수 있게).
  outputFileTracingIncludes: {
    "/api/mcp": ["./instructions/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
