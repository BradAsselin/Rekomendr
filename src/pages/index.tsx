import { useEffect, useState } from 'react';
import SurveyModal from '../components/SurveyModal';

type Rec = { id: string; title: string; description: string };

function getAnonId(): string {
  if (typeof window === 'undefined') return 'server';
  const key = 'rekom_anon_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(key, id);
  }
  return id;
}

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSurvey, setShowSurvey] = useState(false);
  const [lastRun, setLastRun] = useState<{ prompt: string; refine?: string } | null>(null);

  useEffect(() => {
    // ensure anon id exists
    getAnonId();
  }, []);

  async function run(promptText: string, refine?: string) {
    setLoading(true);
    setError('');
    setResults([]);
    setLastRun({ prompt: promptText, refine });

    try {
      const r = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, refine, anonId: getAnonId() }),
      });

      if (r.status === 403) {
        const j = await r.json();
        if (j?.needSurvey) {
          setShowSurvey(true);
          setLoading(false);
          return;
        }
      }

      if (!r.ok) {
        throw new Error(`Server error: ${r.status}`);
      }

      const j = await r.json();
      setResults(j.suggestions || []);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function onSurveyGranted(_n: number) {
    setShowSurvey(false);
    if (lastRun) {
      // retry the last request with the new bonus tokens
      await run(lastRun.prompt, lastRun.refine);
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    run(prompt.trim());
  };

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 720, margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ textAlign: 'center' }}>Rekomendr.AI</h1>
      <p style={{ textAlign: 'center', color: '#555' }}>
        It’s like we read your mind. But better.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What can I find for you?"
          style={{ flex: 1, padding: 12, border: '1px solid #ccc', borderRadius: 8 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Thinking…' : 'GO'}
        </button>
      </form>

      {error && <p style={{ color: 'red', marginTop: 12 }}>{error}</p>}

      <div style={{ marginTop: 24 }}>
        {results.map((it) => (
          <div key={it.id} style={{ padding: 12, borderBottom: '1px solid #eee' }}>
            <div style={{ fontWeight: 600 }}>{it.title}</div>
            <div style={{ color: '#555' }}>{it.description}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 12, opacity: 0.8 }}>
              <button style={{ border: '1px solid #ddd', borderRadius: 20, padding: '4px 10px' }}>
                👍
              </button>
              <button style={{ border: '1px solid #ddd', borderRadius: 20, padding: '4px 10px' }}>
                👎
              </button>
              <button style={{ border: '1px solid #ddd', borderRadius: 20, padding: '4px 10px' }}>
                ●
              </button>
            </div>
          </div>
        ))}
      </div>

      <SurveyModal
        open={showSurvey}
        onClose={() => setShowSurvey(false)}
        onGranted={onSurveyGranted}
      />
    </div>
  );
}
