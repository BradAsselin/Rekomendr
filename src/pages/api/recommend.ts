import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

/** ========= Config (tweak without touching logic) ========= */
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini"; // cheap & good
const MAX_TOKENS = Number(process.env.REC_MAX_TOKENS ?? 300); // per call
const MAX_PROMPT_CHARS = Number(process.env.REC_MAX_PROMPT_CHARS ?? 400);

// naive cost estimator (USD) for sanity caps
const PRICE_PER_1K = Number(process.env.REC_PRICE_PER_1K ?? 0.005); // adjust for your model
const DAILY_MAX_CALLS = Number(process.env.REC_DAILY_MAX_CALLS ?? 1000);

// rate limit: 60 requests / 10 min per IP
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = Number(process.env.REC_RL_MAX ?? 60);
const RL_BURST = Number(process.env.REC_RL_BURST ?? 10);

// cache: 30 minutes
const CACHE_TTL_MS = Number(process.env.REC_CACHE_TTL_MS ?? 30 * 60 * 1000);

// Turnstile (optional): set TURNSTILE_SECRET to enforce
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET ?? "";

/** ========= In-memory state (serverless-friendly but ephemeral) ========= */
type Action = { label: string; href: string };
type Rec = { id: string; title: string; description: string; actions: Action[] };

type CacheEntry = { expires: number; json: { ok: true; results: Rec[] } };

const g: any = globalThis as any;
if (!g.__rk_cache) g.__rk_cache = new Map<string, CacheEntry>();
if (!g.__rk_rate) g.__rk_rate = new Map<string, { count: number; ts: number }>();
if (!g.__rk_day) g.__rk_day = { dayKey: dayKey(), count: 0 };

const cache: Map<string, CacheEntry> = g.__rk_cache;
const rate: Map<string, { count: number; ts: number }> = g.__rk_rate;

/** ========= Helpers ========= */
function dayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}
function resetDayCounterIfNeeded() {
  const d = g.__rk_day;
  const nowKey = dayKey();
  if (d.dayKey !== nowKey) {
    g.__rk_day = { dayKey: nowKey, count: 0 };
  }
}
function ipFrom(req: NextApiRequest) {
  const xf = (req.headers["x-forwarded-for"] as string) || "";
  return xf.split(",")[0].trim() || (req.socket?.remoteAddress ?? "unknown");
}
function hashKey(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `h${h}`;
}
function buildHref(title: string, category: string, description: string) {
  return `/product?title=${encodeURIComponent(title)}&category=${encodeURIComponent(
    category
  )}&desc=${encodeURIComponent(description)}`;
}

/** ========= Optional: Cloudflare Turnstile verify ========= */
async function verifyTurnstile(token: string | undefined, ip: string) {
  if (!TURNSTILE_SECRET) return true; // not enforced
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(TURNSTILE_SECRET)}&response=${encodeURIComponent(
        token
      )}&remoteip=${encodeURIComponent(ip)}`,
    });
    const data = (await r.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}

/** ========= OpenAI client ========= */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** ========= Handler ========= */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.MAINTENANCE === "true") {
    return res.status(503).json({ ok: false, error: "Temporarily offline for maintenance" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ ok: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const ip = ipFrom(req);

    // simple per-IP rate limiter
    const now = Date.now();
    const k = `${ip}:${Math.floor(now / RL_WINDOW_MS)}`;
    const entry = rate.get(k) ?? { count: 0, ts: now };
    entry.count += 1;
    rate.set(k, entry);
    if (entry.count > RL_MAX + RL_BURST) {
      return res.status(429).json({ ok: false, error: "Too many requests. Try again later." });
    }

    resetDayCounterIfNeeded();
    if (g.__rk_day.count >= DAILY_MAX_CALLS) {
      return res.status(429).json({ ok: false, error: "Daily capacity reached. Please try tomorrow." });
    }

    const { category = "universal", prompt, refine, turnstileToken } = (req.body || {}) as {
      category?: string;
      prompt?: string;
      refine?: string;
      turnstileToken?: string;
    };

    // Basic input checks
    const cleanPrompt = (prompt ?? "").trim().replace(/\s+/g, " ");
    const cleanRefine = (refine ?? "").trim().replace(/\s+/g, " ");
    if (!cleanPrompt) {
      return res.status(400).json({ ok: false, error: "Missing prompt" });
    }
    if (cleanPrompt.length > MAX_PROMPT_CHARS) {
      return res.status(400).json({ ok: false, error: `Prompt too long (>${MAX_PROMPT_CHARS} chars)` });
    }

    // Optional CAPTCHA
    const captchaOk = await verifyTurnstile(turnstileToken, ip);
    if (!captchaOk) {
      return res.status(400).json({ ok: false, error: "Captcha failed. Please retry." });
    }

    // Cache
    const key = hashKey(`${category}|${cleanPrompt}|${cleanRefine}`);
    const hit = cache.get(key);
    if (hit && hit.expires > now) {
      return res.status(200).json(hit.json);
    }

    // Spend sanity (very rough): assume ~ (prompt ~200 + MAX_TOKENS) tokens
    const estTokens = 200 + MAX_TOKENS;
    const estCost = (estTokens / 1000) * PRICE_PER_1K;
    if (Number.isFinite(estCost) && estCost > Number(process.env.REC_PER_CALL_CAP_USD ?? 0.05)) {
      return res.status(400).json({ ok: false, error: "Per-call cost cap exceeded." });
    }

    // ---- OpenAI call ----
    const system = [
      "You are Rekomendr, a brisk, practical recommender.",
      "Given a user prompt (and optional refine hint), return FIVE options.",
      "Output strictly as JSON: { results: [{title, description}] }",
      "Titles short (<=60 chars). Descriptions one sentence.",
      "Do not include markdown, commentary, or extra keys."
    ].join(" ");

    const user = `category=${category}\nprompt="${cleanPrompt}"${
      cleanRefine ? `\nrefine="${cleanRefine}"` : ""
    }`;

    const resp = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const content = resp.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { results: [] };
    }

    const items: Rec[] = (parsed.results || []).slice(0, 5).map((r: any, i: number) => {
      const title = String(r.title ?? `Option ${i + 1}`);
      const description = String(r.description ?? "A solid pick for your prompt.");
      const href = buildHref(title, category, description);
      return {
        id: `${Date.now()}-${i + 1}`,
        title,
        description,
        actions: [{ label: "See details", href }],
      };
    });

    // If model returned nothing, fabricate safe fallbacks (still clickable)
    if (items.length === 0) {
      const base = `${cleanPrompt}${cleanRefine ? ` • ${cleanRefine}` : ""}`.trim();
      for (let i = 0; i < 5; i++) {
        const title = `Option ${i + 1}: ${base.slice(0, 48)}${base.length > 48 ? "…" : ""}`;
        const description = `A solid pick based on: “${cleanPrompt}”${cleanRefine ? ` refined by “${cleanRefine}”` : ""}.`;
        items.push({
          id: `${Date.now()}-${i + 1}`,
          title,
          description,
          actions: [{ label: "See details", href: buildHref(title, category, description) }],
        });
      }
    }

    const json = { ok: true as const, results: items };
    cache.set(key, { expires: now + CACHE_TTL_MS, json });

    // increment daily counter after successful generation
    g.__rk_day.count += 1;

    return res.status(200).json(json);
  } catch (err: any) {
    console.error("recommend error:", err?.message);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
