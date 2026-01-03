import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You are a precise JSON-only generator.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.4,
    });

    const text =
      completion.choices[0]?.message?.content?.trim();

    // Try to parse JSON safely
    try {
      return NextResponse.json(JSON.parse(text || ""));
    } catch {
      console.error("JSON PARSE FAILED:", text);
      return NextResponse.json([], { status: 200 });
    }
  } catch (err) {
    console.error("OPENAI ERROR:", err);
    return NextResponse.json([], { status: 500 });
  }
}
