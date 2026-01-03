import React from 'react';
import ResultsV4 from '../components/ResultsV4';

export default function IndexPage() {
  return (
    <main className="min-h-screen bg-[#0b1725] text-white">
      <ResultsV4 initialQuery="" initialVertical="movies" autoRunQuery={false} />
    </main>
  );
}
