// app/layout.tsx
import "./globals.css";
import HomeWordmark from "../src/components/HomeWordmark";
import InstallButton from "../src/components/InstallButton";
import MoreMenu from "../src/components/MoreMenu";
import SavedPage from "../src/components/SavedPage";

export const metadata = {
  // S2 — link scrapers reject relative og:image URLs; this resolves them.
  // The shared-anchor page (/a/[id]) builds its own absolute URLs from the
  // request host, so a preview deployment unfurls its own image.
  metadataBase: new URL("https://rekomendr.ai"),
  title: "Rekomendr.AI",
  description: "Taste-first recommendations across movies, TV, books, and wine.",
  manifest: "/manifest.json",
};

// S3.1 — iPhone safe area. The installed app draws under the status bar
// (black-translucent), so the bar is pushed below the inset, and a fixed
// navy strip the height of the inset stays behind the clock while the page
// scrolls — nothing (the ⋯ menu included) slides under it.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function StatusBarShield() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-[#0b1725]"
      style={{ height: "env(safe-area-inset-top)" }}
    />
  );
}

// S24b — four labeled buttons (Favorites · Watched · Recent · Saved, each
// opening the Saved page on its tab) and the ⋯ menu at the right.
// S26a — two rows (board F1): the wordmark left-aligned with ⋯ on the
// right, then the four list buttons as outlined tiles. The big centered
// wordmark on the home page is gone; this one is the home affordance.
function TopBar() {
  return (
    <div
      className="w-full bg-[#0b1725]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="mx-auto w-full max-w-xl px-4 pt-1.5">
        <div className="flex h-11 items-center justify-between gap-2">
          <HomeWordmark />
          <div className="-mr-2 flex items-center">
            <MoreMenu attribution={<Attribution />} />
            <InstallButton />
          </div>
        </div>
        <SavedPage />
      </div>
    </div>
  );
}

// TMDb's API terms require this notice wherever the API is used (the
// real-title guard checks every movie/TV rek against it). S24b: it lives
// in the top bar's ⋯ menu (on every page, as before), small and quiet,
// at AA contrast for small text. S2.4: their logo beside it, as their
// terms ask — the official "blue_short" SVG (public/tmdb-logo.svg), 10px
// tall so it stays less prominent than ours. Not a link: no new tap target.
function Attribution() {
  return (
    <footer className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-gray-500">
      {/* eslint-disable-next-line @next/next/no-img-element -- a 2 KB static SVG; next/image adds nothing */}
      <img src="/tmdb-logo.svg" alt="TMDB" width={77} height={10} className="h-[10px] w-auto" />
      <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
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
      {/* S26a — 100dvh, not 100vh: on iPhone 100vh is taller than the
          visible page (the toolbar), which made home scroll. */}
      <body className="min-h-[100dvh] bg-[#0b1725] sm:bg-white">
        <StatusBarShield />
        <TopBar />
        {children}
      </body>
    </html>
  );
}
