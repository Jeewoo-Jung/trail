import type { NextConfig } from "next";

// 모든 주소에 붙이는 보안 헤더. 특히 승인 화면(/oauth/consent)을 다른 사이트의 틀(iframe) 안에 몰래 넣어 누르게 하는 공격(클릭재킹)을 막는다.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" }, // frame-ancestors를 모르는 옛 브라우저용
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // https에서만 의미가 있고 http(로컬)에서는 무시된다
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
