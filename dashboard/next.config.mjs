/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Include data/ files in the serverless function bundle.
    // Without this, fs.readFileSync calls at runtime fail on Vercel because
    // the output file tracer only includes statically-imported files.
    outputFileTracingIncludes: {
      "/api/portfolio": ["./data/**/*"],
      "/api/position/[ticker]": ["./data/**/*"],
      "/api/comparables/[ticker]": ["./data/**/*"],
      "/api/chart/[ticker]": ["./data/**/*"],
      "/api/run": ["./data/**/*"],
      "/api/settings": ["./data/**/*"],
    },
  },
};

export default nextConfig;
