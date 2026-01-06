// app/layout.tsx
import "./globals.css";
import InstallButton from "../src/components/InstallButton";

export const metadata = {
  title: "Rekomendr.AI",
  description: "Taste-first recommendations across movies, TV, books, and wine.",
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
      {/* ✅ Key fix: remove global text-white so card/title colors don't get forced */}
      <body className="min-h-screen bg-[#0b1725]">
        <TopBar />
        {children}
      </body>
    </html>
  );
}
