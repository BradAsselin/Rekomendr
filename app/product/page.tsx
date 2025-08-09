"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

/**
 * Rekomendr – Page 3 (Conversion Layer)
 * Single-file, drop-in page for Next.js (App Router) at /app/product/page.tsx
 * 
 * WHAT THIS DOES
 * - Renders a conversion-focused detail page after a user clicks a recommendation
 * - Mobile-first responsive layout
 * - Clean CTA stack with affiliate buttons
 * - Schema.org JSON-LD for SEO/link previews
 * - Thumbs feedback + quick refine
 * - Safe fallbacks if no search params are provided
 *
 * HOW TO INSTALL (Next.js App Router)
 * 1) Create file: /app/product/page.tsx and paste this entire file
 * 2) Ensure Tailwind is enabled (this uses only Tailwind classes)
 * 3) Navigate to /product?title=Arrival&year=2016&id=tt2543164&genre=Sci-Fi&runtime=116&rating=PG-13&poster=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Foriginal%2Fxyz.jpg&synopsis=A%20linguist%20deciphers%20an%20alien%20language...&trailer=yid_abc123
 * 4) (Optional) When the user clicks a card on Page 2, push them here with those params set.
 */

// Utility: Build affiliate link stubs. Replace with real mapping later.
function buildAffiliateLinks(title: string) {
  const slug = encodeURIComponent(title.trim());
  return [
    { name: "Amazon Prime Video", href: `https://www.amazon.com/s?k=${slug}+movie&utm_source=rekomendr` },
    { name: "Apple TV", href: `https://tv.apple.com/search?term=${slug}&utm_source=rekomendr` },
    { name: "Google Play", href: `https://play.google.com/store/search?q=${slug}%20movie&utm_source=rekomendr` },
    { name: "Vudu", href: `https://www.vudu.com/content/browse?search=${slug}&utm_source=rekomendr` },
  ];
}

// Utility: Simple clamp
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

// Types for search params (all optional)
interface ProductParams {
  id?: string;
  title?: string;
  year?: string;
  genre?: string;
  runtime?: string; // minutes
  rating?: string; // MPAA/TV rating
  poster?: string; // image URL
  synopsis?: string;
  trailer?: string; // e.g., "yid_dQw4w9WgXcQ" or full URL
  score?: string; // optional rekomendr score 0-100
  why?: string; // why we picked it
}

// Read search params via next/navigation in app router
import { useSearchParams, useRouter } from "next/navigation";

function useProductParams(): ProductParams {
  const sp = useSearchParams();
  const params: ProductParams = useMemo(() => ({
    id: sp?.get("id") ?? undefined,
    title: sp?.get("title") ?? undefined,
    year: sp?.get("year") ?? undefined,
    genre: sp?.get("genre") ?? undefined,
    runtime: sp?.get("runtime") ?? undefined,
    rating: sp?.get("rating") ?? undefined,
    poster: sp?.get("poster") ?? undefined,
    synopsis: sp?.get("synopsis") ?? undefined,
    trailer: sp?.get("trailer") ?? undefined,
    score: sp?.get("score") ?? undefined,
    why: sp?.get("why") ?? undefined,
  }), [sp]);
  return params;
}

// Format helpers
function minsToHr(minStr?: string) {
  if (!minStr) return undefined;
  const m = parseInt(minStr, 10);
  if (Number.isNaN(m) || m <= 0) return undefined;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

function safe(url?: string) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.toString();
  } catch {
    return undefined;
  }
}

// Trailer embed extractor (expects "yid_XXXX" or full YouTube URL)
function toYouTubeId(trailer?: string) {
  if (!trailer) return undefined;
  if (trailer.startsWith("yid_")) return trailer.replace("yid_", "");
  try {
    const u = new URL(trailer);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") ?? undefined;
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
  } catch {}
  return undefined;
}

// Minimal star/score display
function ScoreBadge({ score }: { score?: string }) {
  if (!score) return null;
  const n = clamp(parseInt(score, 10) || 0, 0, 100);
  return (
    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold bg-black/80 text-white shadow">
      <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
      Rekomendr Score: {n}
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const qp = useProductParams();

  // Fallbacks from localStorage (allow Page 2 to stash payload under a known key)
  const [fallback, setFallback] = useState<Partial<ProductParams>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rekomendr:lastSelection");
      if (raw) setFallback(JSON.parse(raw));
    } catch {}
  }, []);

  const data: ProductParams = { ...fallback, ...qp } as ProductParams;
  const title = data.title ?? "Your Pick";
  const poster = safe(data.poster);
  const trailerId = toYouTubeId(data.trailer);
  const runtimeFmt = minsToHr(data.runtime);
  const affiliates = buildAffiliateLinks(title);

  // JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: title,
    image: poster,
    datePublished: data.year,
    description: data.synopsis,
    genre: data.genre?.split(",").map((g) => g.trim()),
    aggregateRating: data.score
      ? { "@type": "AggregateRating", ratingValue: data.score, ratingCount: 100 }
      : undefined,
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 backdrop-blur bg-neutral-950/80">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight text-lg">Rekomendr.AI</Link>
          <div className="flex items-center gap-3 text-sm">
            <ScoreBadge score={data.score} />
            <button
              onClick={() => router.back()}
              className="rounded-full border border-white/15 px-3 py-1 hover:bg-white/10 transition"
            >Back</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-6 md:py-10 grid grid-cols-1 md:grid-cols-[260px,1fr] gap-6 md:gap-10">
        <div className="relative w-full aspect-[2/3] md:w-[260px] md:aspect-[2/3] overflow-hidden rounded-2xl bg-neutral-800">
          {poster ? (
            <Image src={poster} alt={title} fill className="object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-neutral-400">No Poster</div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">{title}</h1>
          <p className="text-neutral-300 text-sm md:text-base">
            <span className="mr-2">{data.year ?? ""}</span>
            {data.rating && <span className="mx-2">• {data.rating}</span>}
            {runtimeFmt && <span className="mx-2">• {runtimeFmt}</span>}
            {data.genre && <span className="mx-2">• {data.genre}</span>}
          </p>

          {data.synopsis && (
            <p className="text-neutral-200/90 leading-relaxed max-w-2xl">{data.synopsis}</p>
          )}

          {data.why && (
            <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-wide text-white/60 mb-1">Why we picked this</div>
              <p className="text-sm text-white/90">{data.why}</p>
            </div>
          )}

          {/* Primary CTAs */}
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {affiliates.map((a) => (
              <a
                key={a.name}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15 transition px-4 py-3 text-center text-sm font-semibold"
              >
                Watch on {a.name}
              </a>
            ))}
          </div>

          {/* Secondary actions */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
              onClick={() => alert("Saved to your list (stub).")}
            >Save</button>
            <button
              className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
              onClick={() => alert("Shared! (stub)")}
            >Share</button>
            <button
              className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
              onClick={() => router.push("/?refine=More%20like%20this")}
            >More like this</button>
          </div>
        </div>
      </section>

      {/* Trailer */}
      {trailerId && (
        <section className="mx-auto max-w-7xl px-4 pb-6">
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video w-full">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${trailerId}`}
              title={`${title} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </section>
      )}

      {/* Facts + Quick Info */}
      <section className="mx-auto max-w-7xl px-4 pb-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-semibold mb-3">Good to know</h2>
          <ul className="text-sm text-white/80 space-y-2">
            {data.rating && <li><span className="text-white/60">Rating:</span> {data.rating}</li>}
            {runtimeFmt && <li><span className="text-white/60">Runtime:</span> {runtimeFmt}</li>}
            {data.genre && <li><span className="text-white/60">Genres:</span> {data.genre}</li>}
            {data.year && <li><span className="text-white/60">Year:</span> {data.year}</li>}
            {data.id && <li><span className="text-white/60">ID:</span> {data.id}</li>}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-semibold mb-3">Keep exploring</h2>
          <div className="flex flex-wrap gap-2">
            {[
              "Happier",
              "Darker",
              "Funnier",
              "More True Crime",
              "More Action",
              "Based on a True Story",
            ].map((chip) => (
              <Link
                key={chip}
                href={`/?refine=${encodeURIComponent(chip)}`}
                className="rounded-full border border-white/15 px-3 py-1 text-sm hover:bg-white/10"
              >{chip}</Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="font-semibold mb-3">Was this a good pick?</h2>
          <div className="flex items-center gap-3">
            <button
              aria-label="Thumbs up"
              onClick={() => alert("Thanks for the thumbs up! (stub)")}
              className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >👍</button>
            <button
              aria-label="Thumbs down"
              onClick={() => alert("Got it — we’ll adjust. (stub)")}
              className="rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
            >👎</button>
          </div>
          <div className="mt-3">
            <input
              placeholder="Say what you were hoping for (optional)"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  alert("Thanks! We'll refine on the next round. (stub)");
                }
              }}
            />
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6 md:p-10 text-center">
          <h3 className="text-2xl md:text-3xl font-extrabold mb-3">Ready to watch?</h3>
          <p className="text-white/80 mb-6">Pick a platform below and you’ll be watching in seconds.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {affiliates.map((a) => (
              <a
                key={a.name}
                href={a.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15 transition px-4 py-3 text-center text-sm font-semibold"
              >
                {a.name}
              </a>
            ))}
          </div>
          <div className="mt-6 text-sm text-white/60">Links may earn us a small commission at no extra cost to you.</div>
        </div>
      </section>

      {/* JSON-LD for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
