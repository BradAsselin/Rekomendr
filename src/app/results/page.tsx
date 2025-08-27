// src/app/results/page.tsx
import ResultsV4 from "../../components/ResultsV4";

export default function ResultsPage({
  searchParams,
}: {
  searchParams: { q?: string; v?: string };
}) {
  const q = searchParams?.q || "";
  const v = searchParams?.v || "movies";
  const autoRunQuery = Boolean(q || v);

  return (
    <ResultsV4
      initialQuery={q}
      initialVertical={v}
      autoRunQuery={autoRunQuery}
    />
  );
}
