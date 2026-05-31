/** @type {import('next').NextConfig} */
const nextConfig = {
  // StrictMode double-mounts components in dev, which re-runs luma.gl's
  // one-time init and leaves the WebGL context dead. Disable it.
  reactStrictMode: false,
  // DuckDB is a native addon — keep it as a runtime require on the server
  // instead of letting webpack try to bundle the .node binary.
  // `ws` must also stay external: bundling it breaks its frame-masking
  // (bufferUtil.mask becomes undefined), which kills the AISStream socket.
  experimental: {
    serverComponentsExternalPackages: ["@duckdb/node-api", "ws"],
  },
};

export default nextConfig;
