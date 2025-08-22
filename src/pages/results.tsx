import React, { useMemo } from "react";
import ResultsV4 from "../components/ResultsV4";

function useQueryParam(name: string) {
  const params = useMemo(
    () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""),
    []
  );
  return typeof window !== "undefined" ? params.get(name) || "" : "";
}

export default function ResultsPage() {
  const q = useQueryParam("q");               // e.g. ?q=feel-good
  const v = useQueryParam("v") || "movies";   // e.g. ?v=movies
  const autoRunQuery = !!q;
  const autoRunVertical = !q && !!v;

  return (
    <ResultsV4
      initialQuery={q}
      initialVertical={v}
      autoRunQuery={autoRunQuery}
      autoRunVertical={autoRunVertical}
    />
  );
}
