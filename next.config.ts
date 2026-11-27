import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lets a test build run in its own folder while a dev server is using .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
