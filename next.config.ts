import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Force HTTPS for 2 years; preload-ready
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Block clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Referrer policy
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Basic XSS protection for older browsers
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      // Force HTTP → HTTPS (Vercel already does this, but belt-and-suspenders)
      {
        source: "/(.*)",
        has: [{ type: "header", key: "x-forwarded-proto", value: "http" }],
        destination: "https://hypefy.chat/:path*",
        permanent: true,
      },
      // Canonicalise www → non-www
      {
        source: "/(.*)",
        has: [{ type: "host", value: "www.hypefy.chat" }],
        destination: "https://hypefy.chat/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
