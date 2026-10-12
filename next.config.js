/** @type {import('next').NextConfig} */
// S3.1 — one id per build, baked into both the client bundle and the
// server (app/api/version). Vercel's commit SHA when present; a build
// timestamp otherwise (local builds).
const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `local-${Date.now()}`;

const nextConfig = {
  reactStrictMode: true,

  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },

  // ✅ Ship-now: stop Vercel/Next builds from failing on ESLint config/version mismatches
  eslint: {
    ignoreDuringBuilds: true,
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "assets.nflxext.com" },
      { protocol: "https", hostname: "occ-0-114-116.1.nflxso.net" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

module.exports = nextConfig;
