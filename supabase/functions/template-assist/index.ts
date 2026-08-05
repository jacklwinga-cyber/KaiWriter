import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { templateId, brief, text } = await req.json() as {
      templateId?: string;
      brief?: string;
      text?: string;
    };

    if (!brief?.trim()) {
      return new Response(JSON.stringify({ error: "Brief required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You help fill document templates. Template id: ${templateId ?? "unknown"}.
User brief: ${brief}
Document excerpt:
${(text ?? "").slice(0, 4000)}

Return JSON only:
{
  "summary": "one sentence",
  "replacements": { "[Placeholder]": "value" },
  "frames": [{ "shot": "Wide", "action": "...", "dialogue": "..." }],
  "images": [{ "placeholder": "[Insert sketch or image placeholder]", "alt": "...", "frameIndex": 0 }]
}
For storyboards include 3 frames with images metadata (no URLs). Match exact bracket placeholders from the text.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await response.json() as { content?: Array<{ text?: string }> };
    const raw = payload.content?.[0]?.text ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    const images = (parsed.images ?? []).map((img: { alt?: string; frameIndex?: number }, i: number) => {
      const frame = (parsed.frames ?? [])[img.frameIndex ?? i];
      const promptText = encodeURIComponent(`storyboard ${frame?.action ?? brief}, ${img.alt ?? brief}`);
      return {
        placeholder: "[Insert sketch or image placeholder]",
        alt: img.alt ?? `Frame ${i + 1}`,
        frameIndex: img.frameIndex ?? i,
        src: `https://image.pollinations.ai/prompt/${promptText}?width=640&height=360&nologo=true`,
      };
    });

    return new Response(JSON.stringify({ ...parsed, images }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
