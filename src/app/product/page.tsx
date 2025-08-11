"use client";

import { useSearchParams, useRouter } from "next/navigation";

export default function ProductPage() {
  const params = useSearchParams();
  const router = useRouter();

  // Cast/guard to keep TS happy
  const title = (params?.get("title") as string) ?? "Your pick";
  const category = (params?.get("category") as string) ?? "universal";
  const desc = (params?.get("desc") as string) ?? "A recommended option based on your prompt.";

  const actions = [
    { label: "Primary Option", href: "#" },
    { label: "Alternative 1", href: "#" },
    { label: "Alternative 2", href: "#" },
    { label: "Learn more", href: "#" },
  ];

  return (
    <main className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <button onClick={() => router.back()} className="text-sm underline w-fit">
        ← Back
      </button>

      <div className="rounded-2xl border p-5">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
          {category}
        </div>
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-gray-700 mb-4">{desc}</p>

        <div className="rounded-xl border bg-gray-50 p-4 text-sm mb-4">
          <div className="font-medium mb-1">Why this fits</div>
          <ul className="list-disc ml-5 space-y-1">
            <li>Matches the core vibe of your ask.</li>
            <li>Balanced between safe pick and something a bit fresh.</li>
            <li>Easy next step with options below.</li>
          </ul>
        </div>

        <div className="grid gap-2">
          {actions.map((a, i) => (
            <a
              key={i}
              href={a.href}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 inline-flex justify-between"
            >
              {a.label} <span className="opacity-60">↗</span>
            </a>
          ))}
        </div>
      </div>

      <div className="text-[11px] text-gray-500">
        Heads up: Links are placeholders for now. We’ll add storefronts/streaming soon.
      </div>
    </main>
  );
}
