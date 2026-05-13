/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

const FH = "https://finnhub.io/api/v1";

async function safe(url: string): Promise<any> {
  try {
    const r = await fetch(url, { next: { revalidate: 1800 } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase().replace(/[^A-Z.]/g, "");
  if (!ticker) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  const fhKey      = process.env.FINNHUB_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const today = new Date().toISOString().split("T")[0];
  const month = new Date(Date.now() - 30 * 864e5).toISOString().split("T")[0];

  const fhNews = fhKey
    ? await safe(`${FH}/company-news?symbol=${ticker}&from=${month}&to=${today}&token=${fhKey}`)
    : null;

  const articles: any[] = Array.isArray(fhNews) ? fhNews.slice(0, 12) : [];
  if (articles.length === 0) {
    return NextResponse.json({ synthesis: null, article_count: 0 });
  }

  const newsText = articles.map((n: any, i: number) => {
    const date = new Date(n.datetime * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return `[${i + 1}] ${date} — ${n.source}\nHeadline: ${n.headline}\nSummary: ${n.summary ?? "(no summary)"}`;
  }).join("\n\n");

  const prompt = `You are a sell-side equity analyst. Below are the most recent news articles (past 30 days) for ${ticker}.

${newsText}

Provide a concise investment-focused synthesis in 3 short paragraphs:
1. The single most impactful recent development and its direct effect on the business/thesis
2. Any regulatory, clinical, earnings, or management news that changes the risk/reward outlook
3. Your read on near-term sentiment and what to watch for next

Be specific — name drugs, deals, executives, numbers where mentioned. Max 280 words. No bullet points.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Anthropic API error", synthesis: null }, { status: 502 });
    }

    const data = await res.json();
    const synthesis = data?.content?.[0]?.text ?? null;
    return NextResponse.json({ synthesis, article_count: articles.length });
  } catch (err) {
    return NextResponse.json({ error: String(err), synthesis: null }, { status: 500 });
  }
}
