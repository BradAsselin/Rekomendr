import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT =
  "You are a taste-aware recommendation engine. Step 1: Identify what is in the photo (wine shelf, beer menu, restaurant menu, streaming screen, product shelf, etc.). Step 2: Extract the available options visible. Step 3: Rank the top 5 most relevant options. Step 4: For each of the 5, write a 1-2 sentence description in plain conversational language — as a knowledgeable friend would describe it, not as a label or menu would. Step 5: Return the detected item as detected_item and the ranked 5 as reks. Return JSON only: { detected_item: { name, description, category }, reks: [ { name, description, rank } ] }. The category field is a short lowercase label for the kind of thing detected — e.g. wine, vodka, beer, food, movies, tv, books, coffee, snacks. Hard rules for reks: the reks array must contain EXACTLY 5 items, every time, no fewer. The reks must NEVER include the detected item itself — they must be 5 DISTINCT recommendations: alternatives to the detected item, or ways to use it, whichever fits the context. No two reks may share the same name.";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const image = typeof body?.image === "string" ? body.image : "";

    if (!image.startsWith("data:image/")) {
      return Response.json({ error: "Missing image" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: image } }],
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content ?? "";

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json(
        { error: "Could not read that photo." },
        { status: 502 }
      );
    }

    const detected = parsed?.detected_item;
    const reks = parsed?.reks;

    if (
      !detected ||
      typeof detected.name !== "string" ||
      !Array.isArray(reks) ||
      reks.length === 0
    ) {
      return Response.json(
        { error: "Could not read that photo." },
        { status: 502 }
      );
    }

    const normalize = (s: string) => s.trim().toLowerCase();
    const detectedName = normalize(detected.name);

    const cleanReks = reks
      .filter((r: any) => r && typeof r.name === "string")
      .filter((r: any) => normalize(r.name) !== detectedName)
      .slice(0, 5)
      .map((r: any, i: number) => ({
        name: r.name,
        description: typeof r.description === "string" ? r.description : "",
        rank: typeof r.rank === "number" ? r.rank : i + 1,
      }));

    if (cleanReks.length < 5) {
      console.warn(
        `RekSnap: only ${cleanReks.length} reks after filtering (model returned ${reks.length}, detected_item: "${detected.name}")`
      );
    }

    return Response.json(
      {
        detected_item: {
          name: detected.name,
          description:
            typeof detected.description === "string"
              ? detected.description
              : "",
          category:
            typeof detected.category === "string" && detected.category.trim()
              ? detected.category.trim().toLowerCase()
              : "unknown",
        },
        reks: cleanReks,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("RekSnap route error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
