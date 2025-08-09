// src/lib/openaiClient.ts
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn('OPENAI_API_KEY is missing. Add it to Vercel Environment Variables.');
}

export const openai = new OpenAI({
  apiKey,
});
