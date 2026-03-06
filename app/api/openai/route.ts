import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Candidate = {
  id: number;
  title: string;
  year: number;
  genre?: string;
  vibeTags?: string[];
  tier?: "T1" | "T2" | "T3";
  short?: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    /* ------------------------------
       V1 MAGIC MODE (prompt based)
    ------------------------------ */
    if (typeof body?.prompt === "string" && body.prompt.trim()) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.85,
        messages: [
          {
            role: "system",
            content: "You are a recommendation engine. Return only valid JSON.",
          },
          {
            role: "user",
            content: body.prompt,
          },
        ],
      });

      const text = completion.choices?.[0]?.message?.content ?? "";

      return new Response(text, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    /* ------------------------------
       CANDIDATE PICKER MODE (old)
    ------------------------------ */
    const { kind, context, count, candidates } = body as {
      kind?: string;
      context?: string;
      count?: number;
      candidates?: Candidate[];
    };

    if (kind === "pick_from_candidates") {
      if (
        typeof context !== "string" ||
        !Array.isArray(candidates) ||
        typeof count !== "number" ||
        candidates.length < count
      ) {
        return Response.json({ ids: null }, { status: 200 });
      }

      const prompt = `
Pick exactly ${count} IDs from the candidate list that best match the context.

Return JSON ONLY in this format:
{ "ids": [1,2,3,4,5] }

Rules:
- ids must be unique
- ids must come only from the candidate list
- no commentary
- no markdown
- no extra keys

Context:
${context}

Candidates:
${JSON.stringify(candidates)}
`.trim();

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });

      const text = completion.choices?.[0]?.message?.content ?? "";

      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return Response.json({ ids: null }, { status: 200 });
      }

      const ids = parsed?.ids;
      if (!Array.isArray(ids) || ids.length !== count) {
        return Response.json({ ids: null }, { status: 200 });
      }

      const idSet = new Set(candidates.map((c) => c.id));
      const uniq = new Set<number>();

      for (const id of ids) {
        if (typeof id !== "number") return Response.json({ ids: null }, { status: 200 });
        if (!idSet.has(id)) return Response.json({ ids: null }, { status: 200 });
        uniq.add(id);
      }

      if (uniq.size !== count) {
        return Response.json({ ids: null }, { status: 200 });
      }

      return Response.json({ ids }, { status: 200 });
    }

    return new Response("Invalid request", { status: 400 });
  } catch (err) {
    console.error("OpenAI route error:", err);
    return new Response("Server error", { status: 500 });
  }
}
