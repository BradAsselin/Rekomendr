// pages/results.tsx
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import Head from "next/head";

// Use a relative import so it works without path aliases.
const ResultsV4 = dynamic(() => import("../components/ResultsV4"), { ssr: false });

type Vertical = "movies" | "tv" | "wine" | "books";

function normalizeVertical(v: unknown): Vertical {
  const allowed: Vertical[] = ["movies", "tv", "wine", "books"];
  return typeof v === "string" && (allowed as string[]).includes(v)
    ? (v as Vertical)
    : "movies";
}

export default function ResultsPage() {
  const router = useRouter();
  const q = typeof router.query.q === "string" ? router.query.q : undefined;
  const v = normalizeVertical(router.query.v);

  return (
    <>
      <Head>
        <title>Rekomendr.AI — Results</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="max-w-3xl mx-auto p-4">
        {q ? (
          <div className="text-sm text-neutral-600 mb-2">
            Results for <span className="font-medium">“{q}”</span> · in {v[0].toUpperCase() + v.slice(1)}
          </div>
        ) : null}

        <ResultsV4
          signedIn={false}
          initialVertical={v}
          autoRunQuery={q}        // triggers fetch on mount if q present
          autoRunVertical={v}     // keeps vertical in sync
          onReset={() => router.push("/")}
        />
      </div>
    </>
  );
}
