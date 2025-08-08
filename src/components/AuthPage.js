import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

// A simple authentication component that supports both sign‑in and sign‑up
// flows.  It uses Supabase for email/password authentication.  On
// successful auth the user is redirected back to the home page.  The
// surrounding App component is responsible for detecting the session and
// updating the user state.
export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('signin'); // 'signin' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleMode = () => {
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!supabase) {
      setError('Supabase client not initialised.');
      setLoading(false);
      return;
    }
    try {
      let response;
      if (mode === 'signin') {
        response = await supabase.auth.signInWithPassword({ email, password });
      } else {
        response = await supabase.auth.signUp({ email, password });
      }
      if (response.error) {
        setError(response.error.message);
      } else {
        // Redirect to home; App component will detect the session change.
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '2rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>{mode === 'signin' ? 'Sign in' : 'Create an account'}</h2>
      {error && <div style={{ color: '#b50000', marginBottom: '0.5rem' }}>{error}</div>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: '0.6rem 0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: '0.6rem 0.8rem', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.6rem 1rem', background: '#004c8c', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>
      <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
        {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          onClick={toggleMode}
          style={{ background: 'none', border: 'none', color: '#004c8c', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}