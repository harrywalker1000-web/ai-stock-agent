/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Include data/ directory in all serverless function bundles.
    // Next.js output file tracer only auto-includes files that are statically
    // importable. Since data/ files are read with runtime-constructed fs paths,
    // they must be explicitly declared here.
    outputFileTracingIncludes: {
      "**": ["./data/**/*"],
    },
  },
};

export default nextConfig;
