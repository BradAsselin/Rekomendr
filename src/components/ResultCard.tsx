"use client";
import Link from "next/link";

type Action = { label: string; href: string };
type Rec = { id: string; title: string; description: string; actions?: Action[] };

function fallbackHref(rec: Rec) {
  try {
    const url = new URL("/product", window.location.origin);
    url.searchParams.set("title", rec.title ?? "Your pick");
    url.searchParams.set("category", "universal");
    url.searchParams.set("desc", rec.description ?? "");
    return url.pathname + "?" + url.searchParams.toString();
  } catch {
    return "#";
  }
}

export default function ResultCard({ rec }: { rec: Rec }) {
  const primary = rec.actions?.[0];
  const href = primary?.href || fallbackHref(rec);

  return (
    <div className="rounded-2xl border p-4 shadow-sm hover:shadow-md transition">
      <div className="text-lg font-semibold mb-1">{rec.title}</div>
      <div className="text-sm text-gray-600 mb-3">{rec.description}</div>
      <Link
        href={href}
        className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium border hover:bg-gray-50 active:scale-[.99]"
      >
        {primary?.label ?? "See details"}
      </Link>
    </div>
  );
}
