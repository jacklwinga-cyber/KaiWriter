/**
 * Client for AI rewriting (the `writing-assist` edge function, mode "rewrite").
 * Sends only the selected text, and only when the caller has the user's
 * consent for online checks. The reply is validated again here.
 */
import {
  ASSIST_ERROR_MESSAGES,
  isAssistErrorCode,
  type AssistErrorCode,
} from '../../supabase/functions/_shared/writingAssistCore';
import {
  MAX_REWRITE_CHARS,
  REWRITE_TOO_LONG_MESSAGE,
  validateRewrite,
  type RewriteStyle,
} from '../../supabase/functions/_shared/rewriteCore';
import { fetchWithTimeout, SourceError } from './writingAssist';

export { MAX_REWRITE_CHARS, REWRITE_STYLE_LABELS, REWRITE_STYLES, type RewriteStyle } from '../../supabase/functions/_shared/rewriteCore';

const REWRITE_TIMEOUT_MS = 35_000;

export interface QuotaInfo {
  limit: number;
  remaining: number;
}

export interface RewriteResult {
  rewrite: string;
  unchanged: boolean;
  quota: QuotaInfo | null;
}

export class RewriteError extends Error {
  readonly code: AssistErrorCode | 'network' | 'timeout' | 'signed_out' | 'not_configured' | 'empty';
  readonly quota: QuotaInfo | null;
  constructor(code: RewriteError['code'], message: string, quota: QuotaInfo | null = null) {
    super(message);
    this.code = code;
    this.quota = quota;
    this.name = 'RewriteError';
  }
}

export interface RewriteOptions {
  accessToken?: string | null;
  supabaseUrl?: string;
  anonKey?: string;
  /** Proofing language, e.g. "en-GB" (keeps UK or US spelling). */
  language?: string;
  signal?: AbortSignal;
}

/**
 * Selected text as sent for rewriting: each paragraph (one line in the
 * plain-text map) separated by a blank line, empty paragraphs dropped.
 */
export function textForRewrite(selected: string): string {
  return selected.split('\n').map((p) => p.trim()).filter(Boolean).join('\n\n');
}

function readQuota(value: unknown): QuotaInfo | null {
  const q = value as { limit?: unknown; remaining?: unknown } | null | undefined;
  return q && Number.isInteger(q.limit) && Number.isInteger(q.remaining)
    ? { limit: q.limit as number, remaining: q.remaining as number }
    : null;
}

export async function requestRewrite(text: string, style: RewriteStyle, options: RewriteOptions = {}): Promise<RewriteResult> {
  if (!text.trim()) throw new RewriteError('empty', 'Select some text to rewrite.');
  if (text.length > MAX_REWRITE_CHARS) throw new RewriteError('too_long', REWRITE_TOO_LONG_MESSAGE);
  const supabaseUrl = options.supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  if (!supabaseUrl) throw new RewriteError('not_configured', ASSIST_ERROR_MESSAGES.not_configured);
  if (!options.accessToken) throw new RewriteError('signed_out', 'Sign in to use AI rewriting.');

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${supabaseUrl}/functions/v1/writing-assist`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          'Content-Type': 'application/json',
          apikey: options.anonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string),
        },
        body: JSON.stringify({ text, mode: 'rewrite', style, language: options.language }),
      },
      REWRITE_TIMEOUT_MS,
      options.signal,
    );
  } catch (err) {
    if (err instanceof SourceError) {
      const code = err.code === 'timeout' ? 'timeout' : 'network';
      throw new RewriteError(
        code,
        code === 'timeout' ? ASSIST_ERROR_MESSAGES.timeout : 'Couldn’t reach Kai AI (you may be offline).',
      );
    }
    throw err; // aborted
  }

  let payload: { rewrite?: unknown; error?: { code?: unknown; message?: unknown }; quota?: unknown } = {};
  try {
    payload = await response.json();
  } catch {
    // handled below
  }
  const quota = readQuota(payload.quota);
  if (!response.ok) {
    const code = isAssistErrorCode(payload.error?.code) ? payload.error.code : 'upstream_error';
    const message = code === 'too_long' ? REWRITE_TOO_LONG_MESSAGE : ASSIST_ERROR_MESSAGES[code];
    throw new RewriteError(code, message, quota);
  }
  if (typeof payload.rewrite !== 'string') {
    throw new RewriteError('invalid_response', ASSIST_ERROR_MESSAGES.invalid_response, quota);
  }
  try {
    const { rewrite, unchanged } = validateRewrite(payload.rewrite, text, style);
    return { rewrite, unchanged, quota };
  } catch {
    throw new RewriteError('invalid_response', ASSIST_ERROR_MESSAGES.invalid_response, quota);
  }
}
