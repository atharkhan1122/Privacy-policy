/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker builds set STANDALONE=1 to emit .next/standalone (self-contained
  // server.js); plain `next build` + `next start` stay the dev/CI default.
  ...(process.env.STANDALONE ? { output: "standalone" } : {}),
};

export default nextConfig;
