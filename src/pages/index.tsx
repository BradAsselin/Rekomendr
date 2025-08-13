import { useState } from 'react';

type Rec = { id: string | number; title: string; description?: string };

export default function Home() {
  const [prompt, setPrompt] = useState('Give me 5 cozy, feel-good movies like The Grand Seduction');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Rec[]>([]);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const runRecommend = async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, refine: '' }),
      });
      if (!res.ok) throw new Error(`Recommend failed: ${res.status}`);
      const data = await res.json();

      // normalize results -> [{id,title,description}]
      const list: Rec[] = (data?.results ?? []).map((r: any) => ({
        id: r?.id ?? crypto.randomUUID(),
        title: r?.title ?? 'Untitled',
        description: r?.description ?? '',
      }));
      setResults(list);

      // fire-and-forget usage tracking
      fetch('/api/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'recommend_run', meta: { items: list.length } }),
      }).catch(() => {});
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const sendFeedback = async (value: 'up' | 'down') => {
    if (feedbackSent) return;
    setFeedbackSent(true);
    try {
      await fetch('/api/survey', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: { thumbs: value, prompt, count: results.length } }),
      });
    } catch {
      // ignore
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-semibold mb-4">Rekomendr</h1>
        <p className="text-sm text-gray-600 mb-6">
          Type a request and I’ll generate tailored recommendations.
        </p>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What do you want recommendations for?"
          />
          <button
            onClick={runRecommend}
            disabled={loading || !prompt.trim()}
            className="rounded-lg bg-blue-600 text-white px-4 py-2 disabled:opacity-50"
          >
            {loading ? 'Working…' : 'Get Recs'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        {!error && results.length > 0 && (
          <div className="mt-6 space-y-3">
            {results.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="font-medium">{r.title}</div>
                {r.description && <div className="text-sm text-gray-600 mt-1">{r.description}</div>}
              </div>
            ))}

            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-gray-600">Helpful?</span>
              <button
                onClick={() => sendFeedback('up')}
                disabled={feedbackSent}
                className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                👍 Yes
              </button>
              <button
                onClick={() => sendFeedback('down')}
                disabled={feedbackSent}
                className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                👎 No
              </button>
              {feedbackSent && <span className="text-xs text-green-600">Thanks!</span>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
