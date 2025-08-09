// src/pages/index.tsx

import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>Rekomendr.AI</title>
        <meta name="description" content="AI-powered recommendations for everything" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh', 
        fontFamily: 'sans-serif',
        background: '#f9f9f9'
      }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>Rekomendr.AI</h1>
        <p style={{ fontSize: '1.5rem', color: '#666' }}>
          It’s like we read your mind. But better.
        </p>
        <input 
          placeholder="What can I find for you?" 
          style={{ 
            marginTop: '2rem', 
            padding: '1rem 2rem', 
            fontSize: '1rem', 
            width: '300px', 
            borderRadius: '8px', 
            border: '1px solid #ccc' 
          }} 
        />
        <button 
          style={{ 
            marginTop: '1rem', 
            padding: '0.75rem 2rem', 
            fontSize: '1rem', 
            backgroundColor: '#0070f3', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer' 
          }}>
          GO
        </button>
      </main>
    </>
  );
}
