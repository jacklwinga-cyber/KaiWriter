import {
  ASSIST_ERROR_MESSAGES,
  isAssistErrorCode,
  MAX_AI_TEXT_CHARS,
  validateIssues,
  type AssistErrorCode,
  type WritingIssueKind,
} from '../../supabase/functions/_shared/writingAssistCore';
import { englishVariantFor, findVariantSpellings } from './englishVariants';
import { englishGrammarFindings } from './grammarRules';

export type { WritingIssueKind };

export interface WritingIssue {
  id: string;
  kind: WritingIssueKind;
  message: string;
  /** Short snippet around the issue */
  context: string;
  offset: number;
  length: number;
  original: string;
  suggestions: string[];
  source: 'languagetool' | 'local' | 'ai';
}

const LANGUAGE_TOOL_URL = 'https://api.languagetool.org/v2/check';
/** The public LanguageTool API rejects longer requests. */
export const MAX_LANGUAGE_TOOL_CHARS = 20_000;
const LANGUAGE_TOOL_TIMEOUT_MS = 15_000;
const AI_TIMEOUT_MS = 30_000;

export type WritingSource = WritingIssue['source'];

/**
 * What happened to each checker, so the UI can say why results are missing
 * instead of silently showing fewer (or no) issues.
 */
export type SourceStatus =
  | { source: WritingSource; state: 'ok'; dropped?: number }
  | { source: WritingSource; state: 'skipped'; reason: 'consent_required' | 'signed_out' | 'not_configured' | 'not_requested'; message: string }
  | { source: WritingSource; state: 'error'; code: AssistErrorCode | 'network' | 'rate_limited' | 'too_long' | 'timeout' | 'unavailable'; message: string };

export interface WritingAnalysis {
  issues: WritingIssue[];
  sources: SourceStatus[];
}

export class SourceError extends Error {
  readonly code: Extract<SourceStatus, { state: 'error' }>['code'];
  constructor(code: SourceError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** fetch with a timeout that also honours the caller's abort signal. */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (timedOut) throw new SourceError('timeout', 'The check took too long. Try again, or check a shorter selection.');
    throw new SourceError('network', 'Couldn’t reach the online check (you may be offline), so only offline checks ran.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

interface LanguageToolMatch {
  offset: number;
  length: number;
  message: string;
  context?: { text?: string; offset?: number };
  replacements?: Array<{ value?: string }>;
  rule?: {
    issueType?: string;
    category?: { id?: string; name?: string };
  };
}

interface LanguageToolResponse {
  matches?: LanguageToolMatch[];
}

const WORDY_PHRASES: Array<{ pattern: RegExp; suggestion: string; message: string }> = [
  { pattern: /\bin order to\b/gi, suggestion: 'to', message: 'Consider shortening “in order to” to “to”.' },
  { pattern: /\bdue to the fact that\b/gi, suggestion: 'because', message: '“Because” is clearer than “due to the fact that”.' },
  { pattern: /\bat this point in time\b/gi, suggestion: 'now', message: '“Now” is more concise.' },
  { pattern: /\bin the event that\b/gi, suggestion: 'if', message: '“If” reads more directly.' },
  { pattern: /\bwith regard to\b/gi, suggestion: 'about', message: '“About” is simpler than “with regard to”.' },
  { pattern: /\bfor the purpose of\b/gi, suggestion: 'to', message: 'Consider using “to” instead of “for the purpose of”.' },
  { pattern: /\butilize\b/gi, suggestion: 'use', message: '“Use” is usually clearer than “utilize”.' },
  { pattern: /\bcommence\b/gi, suggestion: 'begin', message: '“Begin” or “start” may read more naturally.' },
];

function kindFromLanguageTool(match: LanguageToolMatch): WritingIssueKind {
  const issueType = match.rule?.issueType?.toLowerCase() ?? '';
  const category = match.rule?.category?.id?.toLowerCase() ?? '';

  if (issueType.includes('misspelling') || category.includes('typo')) return 'spelling';
  if (issueType.includes('punctuation') || category.includes('punctuation')) return 'punctuation';
  if (category.includes('style') || issueType.includes('style')) return 'style';
  if (issueType.includes('grammar') || category.includes('grammar')) return 'grammar';
  return 'grammar';
}

function snippet(text: string, offset: number, length: number): string {
  const pad = 28;
  const start = Math.max(0, offset - pad);
  const end = Math.min(text.length, offset + length + pad);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

/** Doubled words that are often correct ("I had had enough", "that that"). */
const ALLOWED_DOUBLES = new Set(['had', 'that', 'is']);

/**
 * Offline checks. The style rules are English-only, so for other languages
 * only checks that don't depend on the language (repeated words) run.
 */
export function localClarityIssues(text: string, languageCode = 'en-US'): WritingIssue[] {
  const issues: WritingIssue[] = [];
  let idCounter = 0;
  const isEnglish = languageCode.toLowerCase().startsWith('en');

  const variant = englishVariantFor(languageCode);
  if (variant) {
    const label = variant === 'en-GB' ? 'UK' : 'US';
    for (const match of findVariantSpellings(text, variant)) {
      issues.push({
        id: `local-variant-${idCounter++}`,
        kind: 'spelling',
        message: `${label} English spelling is “${match.replacement}”.`,
        context: snippet(text, match.offset, match.length),
        offset: match.offset,
        length: match.length,
        original: match.original,
        suggestions: [match.replacement],
        source: 'local',
      });
    }
  }

  const duplicateWord = /\b([\p{L}]+)\s+\1\b/giu;
  for (const match of text.matchAll(duplicateWord)) {
    const word = match[1];
    if (ALLOWED_DOUBLES.has(word.toLowerCase())) continue;
    const offset = match.index ?? 0;
    issues.push({
      id: `local-dup-${idCounter++}`,
      kind: 'clarity',
      message: `Repeated word “${word}”.`,
      context: snippet(text, offset, match[0].length),
      offset,
      length: match[0].length,
      original: match[0],
      suggestions: [word],
      source: 'local',
    });
  }

  if (!isEnglish) return issues;

  for (const finding of englishGrammarFindings(text)) {
    issues.push({
      id: `local-${finding.rule}-${idCounter++}`,
      kind: finding.kind,
      message: finding.message,
      context: snippet(text, finding.offset, finding.length),
      offset: finding.offset,
      length: finding.length,
      original: finding.original,
      suggestions: finding.suggestions,
      source: 'local',
    });
  }

  const sentences = [...text.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)];
  for (const sentenceMatch of sentences) {
    const sentence = sentenceMatch[0].trim();
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    if (wordCount < 35) continue;
    const offset = (sentenceMatch.index ?? 0) + (sentenceMatch[0].length - sentenceMatch[0].trimStart().length);
    const unpunctuated = !/[,;:—–()]/.test(sentence);
    issues.push({
      id: `local-long-${idCounter++}`,
      kind: 'clarity',
      message: unpunctuated
        ? `Long sentence (${wordCount} words) with no commas or other breaks: it may be a run-on. Consider splitting it.`
        : `Long sentence (${wordCount} words). Consider splitting it for readability.`,
      context: snippet(text, offset, sentence.length),
      offset,
      length: sentence.length,
      original: sentence,
      suggestions: [],
      source: 'local',
    });
  }

  for (const rule of WORDY_PHRASES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const match of text.matchAll(regex)) {
      const offset = match.index ?? 0;
      issues.push({
        id: `local-wordy-${idCounter++}`,
        kind: 'style',
        message: rule.message,
        context: snippet(text, offset, match[0].length),
        offset,
        length: match[0].length,
        original: match[0],
        suggestions: [rule.suggestion],
        source: 'local',
      });
    }
  }

  const passiveVoice = /\b(am|is|are|was|were|been|being)\s+\w+(ed|en)\b/gi;
  let passiveCount = 0;
  for (const match of text.matchAll(passiveVoice)) {
    if (passiveCount >= 3) break;
    passiveCount += 1;
    const offset = match.index ?? 0;
    issues.push({
      id: `local-passive-${idCounter++}`,
      kind: 'style',
      message: 'Possible passive voice. Active voice is often clearer in business writing.',
      context: snippet(text, offset, match[0].length),
      offset,
      length: match[0].length,
      original: match[0],
      suggestions: [],
      source: 'local',
    });
  }

  return issues;
}

async function checkWithLanguageTool(text: string, languageCode: string, signal?: AbortSignal): Promise<WritingIssue[]> {
  if (text.length > MAX_LANGUAGE_TOOL_CHARS) {
    throw new SourceError(
      'too_long',
      `Online grammar checks work on up to ${MAX_LANGUAGE_TOOL_CHARS.toLocaleString('en-US')} characters. Select a section and check that instead.`,
    );
  }
  const body = new URLSearchParams({
    text,
    language: languageCode,
    enabledCategories: 'TYPOS,GRAMMAR,PUNCTUATION,STYLE,REDUNDANCY,PLAIN_ENGLISH',
  });

  let response = await fetchWithTimeout(
    LANGUAGE_TOOL_URL,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
    LANGUAGE_TOOL_TIMEOUT_MS,
    signal,
  );
  // One retry for transient server errors (not for rate limits, which a retry only prolongs).
  if (response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    response = await fetchWithTimeout(
      LANGUAGE_TOOL_URL,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
      LANGUAGE_TOOL_TIMEOUT_MS,
      signal,
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new SourceError('rate_limited', 'The online grammar check is busy. Wait a minute and try again.');
    }
    if (response.status === 413) {
      throw new SourceError('too_long', 'This text is too long for the online grammar check. Check a selection instead.');
    }
    throw new SourceError('unavailable', 'The online grammar check is temporarily unavailable.');
  }

  let payload: LanguageToolResponse;
  try {
    payload = (await response.json()) as LanguageToolResponse;
  } catch {
    throw new SourceError('unavailable', 'The online grammar check returned an unreadable result.');
  }
  const issues: WritingIssue[] = [];
  (payload.matches ?? []).forEach((match, index) => {
    const offset = Number(match.offset);
    const length = Number(match.length);
    // Ignore matches that don't fit the text we sent.
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > text.length) return;
    const suggestions = (match.replacements ?? [])
      .map((r) => r.value)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .slice(0, 5);
    issues.push({
      id: `lt-${offset}-${length}-${index}`,
      kind: kindFromLanguageTool(match),
      message: match.message,
      context: match.context?.text?.trim() || snippet(text, offset, length),
      offset,
      length,
      original: text.slice(offset, offset + length),
      suggestions,
      source: 'languagetool',
    });
  });
  return issues;
}

async function checkWithAiAssist(
  text: string,
  accessToken: string,
  supabaseUrl: string,
  signal?: AbortSignal,
): Promise<{ issues: WritingIssue[]; dropped: number }> {
  if (text.length > MAX_AI_TEXT_CHARS) throw new SourceError('too_long', ASSIST_ERROR_MESSAGES.too_long);

  const response = await fetchWithTimeout(
    `${supabaseUrl}/functions/v1/writing-assist`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ text, mode: 'suggestions' }),
    },
    AI_TIMEOUT_MS,
    signal,
  );

  let payload: { issues?: unknown; dropped?: number; error?: { code?: unknown } } = {};
  try {
    payload = await response.json();
  } catch {
    // handled below
  }
  if (!response.ok) {
    const code = isAssistErrorCode(payload.error?.code) ? payload.error.code : 'upstream_error';
    throw new SourceError(code, ASSIST_ERROR_MESSAGES[code]);
  }
  if (!Array.isArray(payload.issues)) throw new SourceError('invalid_response', ASSIST_ERROR_MESSAGES.invalid_response);

  // Re-validate on the client: positions must match the text we actually sent.
  const { issues, dropped } = validateIssues(payload.issues, text, 'suggestions');
  return {
    dropped: dropped + (payload.dropped ?? 0),
    issues: issues.map((issue, index) => ({
      ...issue,
      id: `ai-${issue.offset}-${index}`,
      context: snippet(text, issue.offset, issue.length),
      source: 'ai' as const,
    })),
  };
}

const SOURCE_PRIORITY: Record<WritingSource, number> = { languagetool: 0, ai: 1, local: 2 };

/** Sort by position and drop exact duplicates (same range and same replacement). */
function dedupeIssues(issues: WritingIssue[]): WritingIssue[] {
  const seen = new Set<string>();
  const result: WritingIssue[] = [];
  const sorted = [...issues].sort(
    (a, b) => a.offset - b.offset || SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source],
  );
  for (const issue of sorted) {
    const key = `${issue.offset}:${issue.length}:${issue.suggestions[0] ?? issue.message.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

export interface AnalyzeOptions {
  /** Run the style/clarity checks (local rules and AI) as well as grammar. */
  includeSuggestions?: boolean;
  accessToken?: string | null;
  languageCode?: string;
  /** Proofreading turned off in preferences. */
  disabled?: boolean;
  /** The user agreed to send text to the online checkers. Without it only local checks run. */
  allowRemote?: boolean;
  signal?: AbortSignal;
  /** Overridable for tests. */
  supabaseUrl?: string;
}

/**
 * Check text with every available checker. Offsets in the result refer to
 * `text` exactly as given (it is not trimmed), so they can be applied back to
 * the document. A failing checker never hides the others' results: its
 * problem is reported in `sources`. Rejects only when aborted.
 */
export async function analyzeWriting(text: string, options: AnalyzeOptions = {}): Promise<WritingAnalysis> {
  if (!text.trim() || options.disabled) return { issues: [], sources: [] };

  const includeSuggestions = options.includeSuggestions ?? true;
  const supabaseUrl = options.supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const consentSkip = {
    state: 'skipped' as const,
    reason: 'consent_required' as const,
    message: 'Online checks are off. Only offline checks ran.',
  };
  const sources: SourceStatus[] = [];
  const issues: WritingIssue[] = [];

  const run = async (source: WritingSource, check: () => Promise<{ issues: WritingIssue[]; dropped?: number }>) => {
    try {
      const result = await check();
      issues.push(...result.issues);
      sources.push({ source, state: 'ok', ...(result.dropped ? { dropped: result.dropped } : {}) });
    } catch (err) {
      if (isAbort(err)) throw err;
      const code = err instanceof SourceError ? err.code : 'unavailable';
      const message = err instanceof SourceError ? err.message : 'This check failed unexpectedly.';
      sources.push({ source, state: 'error', code, message });
    }
  };

  const tasks: Array<Promise<void>> = [];

  if (options.allowRemote) {
    tasks.push(run('languagetool', async () => ({
      issues: await checkWithLanguageTool(text, options.languageCode ?? 'en-US', options.signal),
    })));
  } else {
    sources.push({ source: 'languagetool', ...consentSkip });
  }

  if (includeSuggestions) {
    tasks.push(run('local', async () => ({ issues: localClarityIssues(text, options.languageCode ?? 'en-US') })));
  }

  if (!includeSuggestions) {
    sources.push({ source: 'ai', state: 'skipped', reason: 'not_requested', message: '' });
  } else if (!options.allowRemote) {
    sources.push({ source: 'ai', ...consentSkip });
  } else if (!supabaseUrl) {
    sources.push({ source: 'ai', state: 'skipped', reason: 'not_configured', message: ASSIST_ERROR_MESSAGES.not_configured });
  } else if (!options.accessToken) {
    sources.push({ source: 'ai', state: 'skipped', reason: 'signed_out', message: ASSIST_ERROR_MESSAGES.unauthorized });
  } else {
    const token = options.accessToken;
    tasks.push(run('ai', () => checkWithAiAssist(text, token, supabaseUrl, options.signal)));
  }

  await Promise.all(tasks);
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return { issues: dedupeIssues(issues), sources };
}

/** A one-line, user-facing note for each checker that didn't run or failed. */
export function describeSourceProblems(sources: SourceStatus[]): string[] {
  const label: Record<WritingSource, string> = { languagetool: 'Grammar & spelling', ai: 'AI suggestions', local: 'Offline checks' };
  return sources
    .filter((s): s is Exclude<SourceStatus, { state: 'ok' }> => s.state !== 'ok' && !(s.state === 'skipped' && s.reason === 'not_requested'))
    .map((s) => `${label[s.source]}: ${s.message}`);
}

export function countIssuesByKind(issues: WritingIssue[]): Record<WritingIssueKind, number> {
  return issues.reduce(
    (acc, issue) => {
      acc[issue.kind] += 1;
      return acc;
    },
    { grammar: 0, spelling: 0, punctuation: 0, style: 0, clarity: 0 },
  );
}

export const ISSUE_KIND_LABELS: Record<WritingIssueKind, string> = {
  grammar: 'Grammar',
  spelling: 'Spelling',
  punctuation: 'Punctuation',
  style: 'Style',
  clarity: 'Clarity',
};
