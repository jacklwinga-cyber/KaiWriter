export type WritingIssueKind = 'grammar' | 'spelling' | 'punctuation' | 'style' | 'clarity';

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

function localClarityIssues(text: string): WritingIssue[] {
  const issues: WritingIssue[] = [];
  let idCounter = 0;

  const duplicateWord = /\b([A-Za-z]{3,})\s+\1\b/gi;
  for (const match of text.matchAll(duplicateWord)) {
    const word = match[1];
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

  const sentences = [...text.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)];
  for (const sentenceMatch of sentences) {
    const sentence = sentenceMatch[0].trim();
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    if (wordCount < 35) continue;
    const offset = sentenceMatch.index ?? 0;
    issues.push({
      id: `local-long-${idCounter++}`,
      kind: 'clarity',
      message: `Long sentence (${wordCount} words). Consider splitting it for readability.`,
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

async function checkWithLanguageTool(text: string, languageCode = 'en-US'): Promise<WritingIssue[]> {
  const body = new URLSearchParams({
    text,
    language: languageCode,
    enabledCategories: 'TYPOS,GRAMMAR,PUNCTUATION,STYLE,REDUNDANCY,PLAIN_ENGLISH',
  });

  const response = await fetch(LANGUAGE_TOOL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Grammar check rate limit reached. Wait a minute and try again.');
    }
    throw new Error('Grammar check is temporarily unavailable.');
  }

  const payload = (await response.json()) as LanguageToolResponse;
  return (payload.matches ?? []).map((match, index) => {
    const suggestions = (match.replacements ?? [])
      .map((r) => r.value?.trim())
      .filter((v): v is string => Boolean(v))
      .slice(0, 5);

    return {
      id: `lt-${match.offset}-${match.length}-${index}`,
      kind: kindFromLanguageTool(match),
      message: match.message,
      context: match.context?.text?.trim() || snippet(text, match.offset, match.length),
      offset: match.offset,
      length: match.length,
      original: text.slice(match.offset, match.offset + match.length),
      suggestions,
      source: 'languagetool' as const,
    };
  });
}

async function checkWithAiAssist(
  text: string,
  accessToken: string | null | undefined,
): Promise<WritingIssue[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl || !accessToken) return [];

  const response = await fetch(`${supabaseUrl}/functions/v1/writing-assist`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({ text, mode: 'suggestions' }),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as { issues?: WritingIssue[] };
  return (payload.issues ?? []).map((issue, index) => ({
    ...issue,
    id: issue.id || `ai-${index}`,
    source: 'ai' as const,
  }));
}

function dedupeIssues(issues: WritingIssue[]): WritingIssue[] {
  const seen = new Set<string>();
  const result: WritingIssue[] = [];
  for (const issue of issues.sort((a, b) => a.offset - b.offset || b.suggestions.length - a.suggestions.length)) {
    const key = `${issue.offset}:${issue.length}:${issue.message.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(issue);
  }
  return result;
}

export async function analyzeWriting(
  text: string,
  options: {
    includeSuggestions?: boolean;
    accessToken?: string | null;
    languageCode?: string;
    disabled?: boolean;
  } = {},
): Promise<WritingIssue[]> {
  const trimmed = text.trim();
  if (!trimmed || options.disabled) return [];

  const includeSuggestions = options.includeSuggestions ?? true;
  const grammarIssues = await checkWithLanguageTool(trimmed, options.languageCode ?? 'en-US');
  const localIssues = includeSuggestions ? localClarityIssues(trimmed) : [];

  let aiIssues: WritingIssue[] = [];
  if (includeSuggestions) {
    try {
      aiIssues = await checkWithAiAssist(trimmed, options.accessToken);
    } catch {
      // AI assist is optional
    }
  }

  return dedupeIssues([...grammarIssues, ...localIssues, ...aiIssues]);
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
