import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Helper function to request recommendations from the OpenAI API.  The
// prompt asks for a list of five items related to the user’s query.  If
// a refinement string is provided it is incorporated into the prompt
// instructing the model to adjust the tone or genre accordingly.  The
// response is expected to be plain text where each suggestion appears on a
// new line in the format "Title — description".  If the API key is
// missing the function resolves to an empty list.
async function fetchRecommendations(promptText, refineText = '') {
  const apiKey = process.env.REACT_APP_OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Missing OpenAI API key.  Please set REACT_APP_OPENAI_API_KEY in your environment.');
    return [];
  }
  const systemPrompt = 'You are an AI recommendation system that suggests five creative and relevant items based on user requests. Respond with a list where each line contains a title followed by a short description separated by a dash.';
  const userPrompt = refineText
    ? `Give me 5 recommendations based on: "${promptText}". Make the list more ${refineText}.`
    : `Give me 5 recommendations based on: "${promptText}".`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 700,
        temperature: 0.7
      })
    });
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];
    // Split the response by newlines and parse each line into title and description.
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    return lines.map((line) => {
      const [titlePart, ...descParts] = line.split(/\s+[-–]\s+/);
      const title = titlePart?.trim();
      const description = descParts.join(' - ').trim();
      return { title, description };
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return [];
  }
}

export default function ResultsPage({
  freeTokens,
  setFreeTokens,
  tokenBalance,
  setTokenBalance,
  user
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const query = location.state?.query || '';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refineText, setRefineText] = useState('');
  const [refineInput, setRefineInput] = useState('');
  const [modifierIndex, setModifierIndex] = useState(0);

  // Suggested modifiers to prompt the user when refining the list.  In a
  // production implementation these would be selected based on the
  // vertical (movies, books, wines, etc.).
  const modifiers = [
    'funny',
    'family friendly',
    'romantic',
    'action-packed',
    'underrated',
    'award winning',
    'true story',
    'spicy',
    'dark',
    'heartwarming'
  ];

  // Rotate through suggested modifiers every five seconds.
  useEffect(() => {
    const interval = setInterval(() => {
      setModifierIndex((i) => (i + 1) % modifiers.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [modifiers.length]);

  // Helper to determine if the user can perform another search.  We
  // prioritise using free tokens first and then paid tokens.  If none
  // remain we return false.
  const hasTokens = useCallback(() => {
    if (freeTokens > 0) return true;
    if (user && tokenBalance > 0) return true;
    return false;
  }, [freeTokens, tokenBalance, user]);

  // Decrement the appropriate token counter when a search is made.
  const consumeToken = useCallback(() => {
    if (freeTokens > 0) {
      setFreeTokens((n) => n - 1);
    } else if (user && tokenBalance > 0) {
      setTokenBalance((n) => n - 1);
    }
  }, [freeTokens, setFreeTokens, tokenBalance, setTokenBalance, user]);

  // Fetch recommendations whenever the query or refineText changes.  If the
  // user is out of tokens we do not attempt to call the API and instead
  // show an error prompting them to sign in or purchase tokens.
  useEffect(() => {
    let ignore = false;
    async function getRecs() {
      if (!query) return;
      if (!hasTokens()) {
        setError(
          user
            ? 'You have used all of your tokens. Please purchase a pack or upgrade.'
            : 'You have used your free searches. Please sign in to continue.'
        );
        setResults([]);
        return;
      }
      setLoading(true);
      setError('');
      const recs = await fetchRecommendations(query, refineText);
      if (!ignore) {
        setResults(recs);
        consumeToken();
      }
      setLoading(false);
    }
    getRecs();
    return () => {
      ignore = true;
    };
  }, [query, refineText, hasTokens, consumeToken, user]);

  const handleRefineSubmit = (e) => {
    e.preventDefault();
    if (!refineInput.trim()) return;
    setRefineText(refineInput.trim());
    setRefineInput('');
  };

  const handleFeedback = (index, feedback) => {
    // Stub: record feedback for future personalization.  Here you might
    // store the feedback in Supabase or adjust the local state.  We
    // simply log it for now.
    console.log('Feedback on', results[index], feedback);
  };

  const handleSignIn = () => {
    navigate('/signin');
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Search results</h2>
      {loading && <p>Loading recommendations…</p>}
      {error && (
        <div style={{ marginBottom: '1rem', color: '#b50000' }}>
          {error}
          {!user && hasTokens() === false && (
            <div>
              <button onClick={handleSignIn} style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', background: '#004c8c', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Sign in
              </button>
            </div>
          )}
        </div>
      )}
      {!loading && results.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {results.map((item, idx) => (
            <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '1.1rem' }}>{item.title}</strong>
                {item.description && (
                  <p style={{ marginTop: '0.3rem', marginBottom: '0', lineHeight: '1.4' }}>{item.description}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleFeedback(idx, 'up')}
                  style={{ border: '1px solid #ccc', background: 'transparent', padding: '0.3rem 0.4rem', cursor: 'pointer' }}
                  title="Like"
                >
                  👍
                </button>
                <button
                  onClick={() => handleFeedback(idx, 'down')}
                  style={{ border: '1px solid #ccc', background: 'transparent', padding: '0.3rem 0.4rem', cursor: 'pointer' }}
                  title="Not for me"
                >
                  👎
                </button>
                <button
                  onClick={() => handleFeedback(idx, 'na')}
                  style={{ border: '1px solid #ccc', background: 'transparent', padding: '0.3rem 0.4rem', cursor: 'pointer' }}
                  title="Haven’t seen"
                >
                  •
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* Refinement input always visible unless completely out of tokens */}
      {hasTokens() && (
        <form onSubmit={handleRefineSubmit} style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            placeholder={`Make the list more… (e.g., ${modifiers[modifierIndex]})`}
            style={{ flex: 1, padding: '0.6rem 0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
          />
          <button type="submit" style={{ padding: '0.6rem 1rem', background: '#004c8c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Refine
          </button>
        </form>
      )}
    </div>
  );
}