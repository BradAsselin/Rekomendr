import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// A rotating list of example prompts.  These help new users understand
// the natural language input style supported by Rekomendr.  They include
// references to movies, wine pairings, and moods.  Feel free to extend
// this list in the future as you add more verticals.
const EXAMPLE_PROMPTS = [
  'Show me true crime movies',
  'I need a bottle of wine to go with chicken',
  'I just finished Breaking Bad',
  "I'm in the mood for a silly comedy movie", 
  "I'm looking for a good cheap dry white wine", 
  'Find me a show like The Bear',
  "Recommend a book that's like The Night Circus", 
  'I want a bold red wine under $20',
  'I need a beer to bring to a BBQ',
  'What should I watch after Stranger Things?'
];

export default function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // Rotate the placeholder text every four seconds.  When unmounted the
  // interval is cleared to avoid memory leaks.
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_PROMPTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // When the user submits the form we navigate to the results page.  The
  // query text is passed in the route state rather than via the URL to
  // avoid encoding issues.
  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    navigate('/results', { state: { query: trimmed } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '10vh', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#004c8c', textAlign: 'center' }}>
        Rekomendr.AI
      </h1>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', width: '100%', maxWidth: '600px', border: '1px solid #d0d7de', borderRadius: '6px', overflow: 'hidden' }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={EXAMPLE_PROMPTS[placeholderIndex]}
          style={{ flex: 1, padding: '0.8rem 1rem', fontSize: '1rem', border: 'none', outline: 'none' }}
        />
        <button
          type="submit"
          style={{ padding: '0 1.5rem', fontSize: '1rem', border: 'none', backgroundColor: '#004c8c', color: '#fff', cursor: 'pointer' }}
        >
          GO
        </button>
      </form>
    </div>
  );
}