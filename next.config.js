/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "assets.nflxext.com" },
      { protocol: "https", hostname: "occ-0-114-116.1.nflxso.net" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" }
    ],
  },
};

module.exports = nextConfig;
