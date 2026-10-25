import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import {
  ASSIST_ERROR_MESSAGES,
  ASSIST_ERROR_STATUS,
  AssistError,
  type AssistErrorCode,
  type AssistMode,
  buildSystemPrompt,
  MAX_AI_TEXT_CHARS,
  parseAssistReply,
  wrapDocument,
} from "../_shared/writingAssistCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configurable so the model can be changed without a code deploy.
const MODEL = Deno.env.get("WRITING_ASSIST_MODEL") ?? "claude-sonnet-4-20250514";
const REQUEST_TIMEOUT_MS = 25_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(code: AssistErrorCode): Response {
  // Log the code only: never the document text, prompt, or provider response body.
  console.error(`[writing-assist] ${code}`);
  return json({ error: { code, message: ASSIST_ERROR_MESSAGES[code] } }, ASSIST_ERROR_STATUS[code]);
}

function errorCodeFor(err: unknown): AssistErrorCode {
  if (err instanceof AssistError) return err.code;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "not_configured";
  }
  if (err instanceof Anthropic.NotFoundError) return "not_configured"; // e.g. a retired model id
  return "upstream_error";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request");
  if (!req.headers.get("authorization")?.startsWith("Bearer ")) return fail("unauthorized");

  let text: string;
  let mode: AssistMode;
  try {
    const body = (await req.json()) as { text?: unknown; mode?: unknown };
    if (typeof body.text !== "string") return fail("bad_request");
    text = body.text;
    mode = body.mode === "grammar" ? "grammar" : "suggestions";
  } catch {
    return fail("bad_request");
  }
  if (!text.trim()) return json({ issues: [], dropped: 0 });
  if (text.length > MAX_AI_TEXT_CHARS) return fail("too_long");

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return fail("not_configured");

  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(mode),
      messages: [{ role: "user", content: wrapDocument(text) }],
    });
    if (response.stop_reason === "refusal") return fail("refused");
    if (response.stop_reason === "max_tokens") return fail("invalid_response");

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    const { issues, dropped } = parseAssistReply(raw, text, mode);
    return json({
      issues,
      dropped,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    });
  } catch (err) {
    return fail(errorCodeFor(err));
  }
});
