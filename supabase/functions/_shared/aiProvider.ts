/**
 * Provider-neutral AI completion with bounded retries and model fallback.
 *
 * Plain TypeScript with no runtime imports (shared by the edge function and
 * Vitest). A provider adapter (e.g. Anthropic, in writing-assist/index.ts)
 * turns its own errors into a ProviderFailure; everything here only sees
 * those, so adding a provider doesn't touch the retry or fallback logic.
 */

export type ProviderFailure =
  | 'timeout'
  | 'rate_limited'
  | 'overloaded'
  | 'model_unavailable'
  | 'auth'
  | 'refused'
  | 'truncated'
  | 'bad_request'
  | 'upstream';

export class ProviderError extends Error {
  readonly failure: ProviderFailure;
  /** Tokens already spent (e.g. a truncated or refused reply), so usage can still be recorded. */
  inputTokens: number;
  outputTokens: number;
  constructor(failure: ProviderFailure, usage: { inputTokens?: number; outputTokens?: number } = {}) {
    super(failure);
    this.failure = failure;
    this.name = 'ProviderError';
    this.inputTokens = usage.inputTokens ?? 0;
    this.outputTokens = usage.outputTokens ?? 0;
  }
}

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  readonly name: string;
  complete(model: string, request: CompletionRequest, timeoutMs: number): Promise<CompletionResult>;
}

export interface ModelRoute {
  provider: AiProvider;
  model: string;
}

/** Worth trying the same model again (after a pause). */
const RETRY_SAME_MODEL: ReadonlySet<ProviderFailure> = new Set(['timeout', 'rate_limited', 'overloaded', 'upstream']);
/** Worth trying the next model. Refusals, truncation, bad requests and credential errors are not. */
const TRY_NEXT_MODEL: ReadonlySet<ProviderFailure> = new Set([
  'timeout', 'rate_limited', 'overloaded', 'upstream', 'model_unavailable',
]);

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,99}$/;
const MAX_MODELS = 4;

/**
 * The models to try, in order: the primary, then the comma-separated
 * fallbacks. Blank, duplicate and malformed ids are ignored.
 */
export function parseModelChain(primary: string | undefined, fallbacks: string | undefined, defaultModel: string): string[] {
  const ids = [primary?.trim() || defaultModel, ...(fallbacks ?? '').split(',').map((s) => s.trim())];
  const chain: string[] = [];
  for (const id of ids) {
    if (id && MODEL_ID.test(id) && !chain.includes(id)) chain.push(id);
    if (chain.length >= MAX_MODELS) break;
  }
  return chain;
}

export interface FallbackOptions {
  /** Extra attempts on the same model for transient failures. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Total time for all attempts, including pauses. */
  budgetMs?: number;
  /** Longest single attempt. */
  attemptTimeoutMs?: number;
  /** Don't start an attempt with less time than this left. */
  minAttemptMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface FallbackResult extends CompletionResult {
  attempts: number;
  /** Tokens across every attempt, including failed ones. */
  totalInputTokens: number;
  totalOutputTokens: number;
  /** True if a model other than the first one answered. */
  fellBack: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Try each route in order. Transient failures are retried on the same model
 * with exponential backoff (bounded); then the next model is tried. Stops
 * when the time budget runs out. Throws the last ProviderError if nothing
 * succeeded (carrying the tokens spent by all attempts); never makes up a result.
 */
export async function completeWithFallback(
  routes: ModelRoute[],
  request: CompletionRequest,
  options: FallbackOptions = {},
): Promise<FallbackResult> {
  const {
    retries = 1,
    baseDelayMs = 500,
    maxDelayMs = 4_000,
    budgetMs = 26_000,
    attemptTimeoutMs = 25_000,
    minAttemptMs = 4_000,
    now = Date.now,
    sleep = defaultSleep,
  } = options;
  if (!routes.length) throw new ProviderError('model_unavailable');

  const deadline = now() + budgetMs;
  let attempts = 0;
  let spentIn = 0;
  let spentOut = 0;
  let last: ProviderError = new ProviderError('timeout');
  const fail = (): never => {
    last.inputTokens = spentIn;
    last.outputTokens = spentOut;
    throw last;
  };

  for (let r = 0; r < routes.length; r += 1) {
    const { provider, model } = routes[r];
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const remaining = deadline - now();
      if (remaining < minAttemptMs) fail();
      attempts += 1;
      try {
        const result = await provider.complete(model, request, Math.min(attemptTimeoutMs, remaining));
        return {
          ...result,
          attempts,
          fellBack: r > 0,
          totalInputTokens: spentIn + result.inputTokens,
          totalOutputTokens: spentOut + result.outputTokens,
        };
      } catch (err) {
        last = err instanceof ProviderError ? err : new ProviderError('upstream');
        spentIn += last.inputTokens;
        spentOut += last.outputTokens;
        if (!TRY_NEXT_MODEL.has(last.failure)) fail();
        if (!RETRY_SAME_MODEL.has(last.failure) || attempt === retries) break;
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
        if (deadline - now() - delay < minAttemptMs) break;
        await sleep(delay);
      }
    }
  }
  return fail();
}
