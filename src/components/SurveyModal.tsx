import { useState } from 'react';

export default function SurveyModal({
  open,
  onClose,
  onGranted,
}: {
  open: boolean;
  onClose: () => void;
  onGranted: (n: number) => void;
}) {
  const [q1, setQ1] = useState<number>(4);
  const [q2, setQ2] = useState<string>('closer-matches');
  const [q2free, setQ2free] = useState<string>('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit() {
    try {
      setBusy(true);
      const anonId =
        typeof window !== 'undefined' ? localStorage.getItem('rekom_anon_id') : null;

      const r = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anonId,
          q1_rating: q1,
          q2_choice: q2,
          q2_free: q2free,
        }),
      });

      const j = await r.json();
      if (j?.ok) {
        onGranted(j.granted ?? 0);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={backdrop}>
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Quick help = more recs 🔥</h3>
        <p style={{ marginTop: 0 }}>
          Answer two quick questions and we’ll add more coins for today.
        </p>

        <label>How close were the recs? (1–5)</label>
        <input
          type="range"
          min={1}
          max={5}
          value={q1}
          onChange={(e) => setQ1(Number(e.target.value))}
          style={{ width: '100%' }}
        />

        <label style={{ marginTop: 12, display: 'block' }}>
          What should we improve most?
        </label>
        <select
          value={q2}
          onChange={(e) => setQ2(e.target.value)}
          style={{ width: '100%', padding: 8 }}
        >
          <option value="closer-matches">Closer matches</option>
          <option value="faster-results">Faster results</option>
          <option value="more-filters">More filters/modifiers</option>
          <option value="save-favorites">Save favorites</option>
        </select>

        <textarea
          placeholder="Optional: tell us more…"
          value={q2free}
          onChange={(e) => setQ2free(e.target.value)}
          style={{ width: '100%', height: 80, marginTop: 8 }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={btnGhost} disabled={busy}>
            Skip
          </button>
          <button onClick={submit} style={btnPrimary} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit & get more'}
          </button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 9999,
};
const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 16,
  width: '100%',
  maxWidth: 420,
  boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
};
const btnPrimary: React.CSSProperties = {
  background: '#0ea5e9',
  color: '#fff',
  border: 'none',
  padding: '10px 14px',
  borderRadius: 8,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  background: '#f1f5f9',
  color: '#111827',
  border: 'none',
  padding: '10px 14px',
  borderRadius: 8,
  cursor: 'pointer',
};