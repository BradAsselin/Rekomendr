// app/layout.tsx
import "./globals.css";
import InstallButton from "../src/components/InstallButton";
import ShareButton from "../src/components/ShareButton";

export const metadata = {
  // S2 — link scrapers reject relative og:image URLs; this resolves them.
  // The shared-anchor page (/a/[id]) builds its own absolute URLs from the
  // request host, so a preview deployment unfurls its own image.
  metadataBase: new URL("https://rekomendr.ai"),
  title: "Rekomendr.AI",
  description: "Taste-first recommendations across movies, TV, books, and wine.",
  manifest: "/manifest.json",
};

function TopBar() {
  return (
    <div className="w-full border-b border-white/10 bg-[#0b1725]">
      <div className="mx-auto flex h-12 w-full max-w-3xl items-center justify-end gap-2 px-4">
        <ShareButton />
        <InstallButton />
      </div>
    </div>
  );
}

// TMDb's API terms require this notice wherever the API is used (the
// real-title guard checks every movie/TV rek against it). Footer, small
// and quiet — the Letterboxd placement. Grey on both backgrounds, at AA
// contrast for small text.
function Attribution() {
  return (
    <footer className="mx-auto w-full max-w-3xl px-4 pb-6 pt-10 text-center text-[11px] leading-snug text-gray-400 sm:text-gray-500">
      This product uses the TMDB API but is not endorsed or certified by TMDB.
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#2D5AB5" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Rekomendr" />
        <link rel="apple-touch-icon" href="/rekomendr_icon_blue_180.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/rekomendr_icon_blue_180.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/rekomendr_icon_blue_167.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/rekomendr_icon_blue_152.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/rekomendr_icon_blue_120.png" />
      </head>
      <body className="min-h-screen bg-[#0b1725] sm:bg-white">
        <TopBar />
        {children}
        <Attribution />
      </body>
    </html>
  );
}
