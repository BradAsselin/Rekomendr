import { useState } from 'react';

export default function Survey() {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/survey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer }),
    });
    setSubmitted(true);
    localStorage.removeItem(`tokens-${new Date().toISOString().slice(0, 10)}`);
  };

  if (submitted) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Thanks!</h1>
        <p>You’ve unlocked more recommendations for today.</p>
        <a href="/">Go back</a>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Quick Survey</h1>
      <form onSubmit={handleSubmit}>
        <label>
          What did you think of Rekomendr so far?
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            style={{ width: '100%', height: '80px', marginTop: '0.5rem' }}
          />
        </label>
        <br />
        <button type="submit" style={{ marginTop: '1rem' }}>
          Submit
        </button>
      </form>
    </div>
  );
}
