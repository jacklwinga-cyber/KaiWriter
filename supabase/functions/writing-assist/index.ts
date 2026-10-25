import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2";
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
import {
  type AiProvider,
  completeWithFallback,
  type CompletionRequest,
  type ProviderFailure,
  ProviderError,
  parseModelChain,
} from "../_shared/aiProvider.ts";
import {
  buildRewriteMessage,
  buildRewritePrompt,
  isRewriteStyle,
  MAX_REWRITE_CHARS,
  maxOutputTokensFor,
  parseRewriteReply,
  REWRITE_TOO_LONG_MESSAGE,
  type RewriteStyle,
} from "../_shared/rewriteCore.ts";
import { effectivePlan, parseDailyLimits, type QuotaInfo, quotaAfterReserve, usageDay } from "../_shared/aiUsageCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configurable so the model can be changed without a code deploy.
// WRITING_ASSIST_FALLBACK_MODELS: optional comma-separated models to try if the first is unavailable.
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const MODELS = parseModelChain(
  Deno.env.get("WRITING_ASSIST_MODEL"),
  Deno.env.get("WRITING_ASSIST_FALLBACK_MODELS"),
  DEFAULT_MODEL,
);
const DAILY_LIMITS = parseDailyLimits((name) => Deno.env.get(name));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(code: AssistErrorCode, extra: Record<string, unknown> = {}): Response {
  // Log the code only: never the document text, prompt, or provider response body.
  console.error(`[writing-assist] ${code}`);
  return json({ error: { code, message: ASSIST_ERROR_MESSAGES[code] }, ...extra }, ASSIST_ERROR_STATUS[code]);
}

function failureFor(err: unknown): ProviderFailure {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "auth";
  if (err instanceof Anthropic.NotFoundError) return "model_unavailable"; // e.g. a retired model id
  if (err instanceof Anthropic.BadRequestError) return "bad_request";
  if (err instanceof Anthropic.APIError && err.status === 529) return "overloaded";
  return "upstream";
}

const ASSIST_CODE_FOR: Record<ProviderFailure, AssistErrorCode> = {
  timeout: "timeout",
  rate_limited: "rate_limited",
  overloaded: "rate_limited",
  model_unavailable: "not_configured",
  auth: "not_configured",
  refused: "refused",
  truncated: "invalid_response",
  bad_request: "upstream_error",
  upstream: "upstream_error",
};

function anthropicProvider(apiKey: string): AiProvider {
  // Retries and fallback are handled by completeWithFallback.
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return {
    name: "anthropic",
    async complete(model: string, request: CompletionRequest, timeoutMs: number) {
      let response;
      try {
        response = await client.messages.create(
          {
            model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: "user", content: request.user }],
          },
          { timeout: timeoutMs },
        );
      } catch (err) {
        throw new ProviderError(failureFor(err));
      }
      const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
      if (response.stop_reason === "refusal") throw new ProviderError("refused", usage);
      if (response.stop_reason === "max_tokens") throw new ProviderError("truncated", usage);
      const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      return { text, model: response.model, ...usage };
    },
  };
}

interface ParsedRequest {
  text: string;
  mode: AssistMode | "rewrite";
  style: RewriteStyle;
  language?: string;
}

async function parseRequest(req: Request): Promise<ParsedRequest | null> {
  try {
    const body = (await req.json()) as { text?: unknown; mode?: unknown; style?: unknown; language?: unknown };
    if (typeof body.text !== "string") return null;
    if (body.mode === "rewrite") {
      if (!isRewriteStyle(body.style)) return null;
      const language = typeof body.language === "string" ? body.language.slice(0, 16) : undefined;
      return { text: body.text, mode: "rewrite", style: body.style, language };
    }
    return { text: body.text, mode: body.mode === "grammar" ? "grammar" : "suggestions", style: "improve" };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request");
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return fail("unauthorized");

  const parsed = await parseRequest(req);
  if (!parsed) return fail("bad_request");
  const { text, mode } = parsed;
  if (!text.trim()) return mode === "rewrite" ? fail("bad_request") : json({ issues: [], dropped: 0 });
  if (mode === "rewrite" && text.length > MAX_REWRITE_CHARS) {
    console.error("[writing-assist] too_long");
    return json({ error: { code: "too_long", message: REWRITE_TOO_LONG_MESSAGE } }, ASSIST_ERROR_STATUS.too_long);
  }
  if (text.length > MAX_AI_TEXT_CHARS) return fail("too_long");

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey || !MODELS.length) return fail("not_configured");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return fail("usage_unavailable");

  // Who is asking (verifies the token, not just its presence).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) return fail("unauthorized");

  // Reserve one request against today's limit for the user's plan.
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: sub } = await admin
    .from("kaiwriter_subscriptions")
    .select("plan, status")
    .eq("user_id", userId)
    .maybeSingle();
  const limit = DAILY_LIMITS[effectivePlan(sub)];
  const day = usageDay(new Date());
  const { data: used, error: reserveError } = await admin.rpc("kaiwriter_ai_reserve", {
    p_user: userId,
    p_day: day,
    p_limit: limit,
  });
  if (reserveError) return fail("usage_unavailable");
  if (Number(used) === -1) return fail("quota_exceeded", { quota: { limit, remaining: 0 } });
  const quota: QuotaInfo | null = quotaAfterReserve(used, limit);
  if (!quota) return fail("usage_unavailable");

  const finish = async (inputTokens: number, outputTokens: number) => {
    // A request that cost nothing (the provider never answered) is given back.
    const { error } = await admin.rpc("kaiwriter_ai_finish", {
      p_user: userId,
      p_day: day,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_refund: inputTokens === 0 && outputTokens === 0,
    });
    if (error) console.error("[writing-assist] usage_record_failed");
  };

  const request: CompletionRequest = mode === "rewrite"
    ? {
      system: buildRewritePrompt(parsed.style, parsed.language),
      user: buildRewriteMessage(text),
      maxTokens: maxOutputTokensFor(parsed.style),
    }
    : { system: buildSystemPrompt(mode), user: wrapDocument(text), maxTokens: 4096 };

  const provider = anthropicProvider(apiKey);
  let result;
  try {
    result = await completeWithFallback(MODELS.map((model) => ({ provider, model })), request);
  } catch (err) {
    const failure = err instanceof ProviderError ? err : new ProviderError("upstream");
    await finish(failure.inputTokens, failure.outputTokens);
    // A refunded request doesn't count against today's limit.
    if (failure.inputTokens === 0 && failure.outputTokens === 0) {
      quota.remaining = Math.min(quota.limit, quota.remaining + 1);
    }
    return fail(ASSIST_CODE_FOR[failure.failure], { quota });
  }
  await finish(result.totalInputTokens, result.totalOutputTokens);
  if (result.fellBack) console.warn("[writing-assist] fallback_model_used");

  const usage = { input_tokens: result.totalInputTokens, output_tokens: result.totalOutputTokens };
  try {
    if (mode === "rewrite") {
      const { rewrite, unchanged } = parseRewriteReply(result.text, text, parsed.style);
      return json({ rewrite, unchanged, usage, quota });
    }
    const { issues, dropped } = parseAssistReply(result.text, text, mode);
    return json({ issues, dropped, usage, quota });
  } catch (err) {
    return fail(err instanceof AssistError ? err.code : "invalid_response", { quota });
  }
});
