/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
      {
        protocol: "https",
        hostname: "m.media-amazon.com", // Amazon Prime posters
      },
      {
        protocol: "https",
        hostname: "is1-ssl.mzstatic.com", // Apple TV posters
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org", // Wikipedia
      },
      {
        protocol: "https",
        hostname: "assets.nflxext.com", // Netflix assets
      },
      {
        protocol: "https",
        hostname: "occ-0-114-116.1.nflxso.net", // Netflix alt
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com", // Google Play
      },
    ],
  },
};

module.exports = nextConfig;
