// app/layout.tsx
import "./globals.css";
import InstallButton from "../src/components/InstallButton";

export const metadata = {
  title: "Rekomendr.AI",
  description: "Taste-first recommendations across movies, TV, books, and wine.",
  manifest: "/manifest.json",
};

function TopBar() {
  return (
    <div className="w-full border-b border-white/10 bg-[#0b1725]">
      <div className="mx-auto flex h-12 w-full max-w-3xl items-center justify-between px-4">
        <div className="text-sm font-semibold tracking-wide text-white">
          Rekomendr<span className="text-white/70">.AI</span>
        </div>

        <InstallButton />
      </div>
    </div>
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
      <body className="min-h-screen bg-[#0b1725]">
        <TopBar />
        {children}
      </body>
    </html>
  );
}
