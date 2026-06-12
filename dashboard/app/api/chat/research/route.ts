import { NextRequest, NextResponse } from "next/server";

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function POST(request: NextRequest) {
  try {
    const { messages, context, ticker } = await request.json() as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      context: string;
      ticker: string;
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reply: "OpenAI API key not configured on this deployment." });
    }

    const systemPrompt = `You are a senior research analyst at Haz Capital who has just completed a full deep-dive on ${ticker.toUpperCase()}.

You have access to the complete research report below — financials, valuation, technicals, scenarios, sentiment, and the investment committee recommendation. Answer questions about this company concisely and with precision.

=== RESEARCH REPORT: ${ticker.toUpperCase()} ===
${truncate(context, 12000)}
=== END REPORT ===

RULES:
1. Lead with the key fact or number. Explanation second. Be direct.
2. Only cite numbers that appear in the report above. Never fabricate figures.
3. If data for a specific question is missing, say so in one sentence.
4. Max 3 paragraphs unless the user explicitly asks for more detail.
5. Reference the relevant report section when useful (e.g. "The DCF model implies…", "Analyst consensus shows…", "The bear scenario assumes…").
6. When asked for opinion or recommendation, reference the Investment Committee's view as the official position — but you may add analytical context.
7. Keep financial figures in their reported units (millions, billions as abbreviated: $1.2B, $340M).`;

    const openAiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.slice(-12), // last 12 turns to stay within context
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: openAiMessages,
        max_tokens: 700,
        temperature: 0.35,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ reply: `[API error ${response.status}]: ${err.slice(0, 200)}` });
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "[No response]";

    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ reply: `[Chat error]: ${String(err).slice(0, 200)}` });
  }
}
