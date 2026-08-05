import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WritingIssue {
  id: string;
  kind: "grammar" | "spelling" | "punctuation" | "style" | "clarity";
  message: string;
  context: string;
  offset: number;
  length: number;
  original: string;
  suggestions: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text, mode = "suggestions" } = await req.json() as { text?: string; mode?: string };
    if (!text?.trim()) {
      return new Response(JSON.stringify({ issues: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ issues: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt =
      mode === "grammar"
        ? `Proofread the text. Return JSON only: {"issues":[{"kind":"grammar|spelling|punctuation","message":"...","offset":0,"length":0,"original":"...","suggestions":["..."],"context":"..."}]}. Use character offsets from the start of the text.\n\nText:\n${text}`
        : `Review the text for clarity and professional tone. Return JSON only: {"issues":[{"kind":"style|clarity","message":"...","offset":0,"length":0,"original":"...","suggestions":["..."],"context":"..."}]}. Limit to 8 high-value suggestions. Use character offsets from the start of the text.\n\nText:\n${text}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ issues: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await response.json() as { content?: Array<{ text?: string }> };
    const raw = payload.content?.[0]?.text ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as { issues?: WritingIssue[] } : { issues: [] };

    const issues = (parsed.issues ?? []).map((issue, index) => ({
      ...issue,
      id: issue.id ?? `ai-${index}`,
      context: issue.context ?? issue.original,
      suggestions: issue.suggestions ?? [],
    }));

    return new Response(JSON.stringify({ issues }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ issues: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
