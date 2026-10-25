import { describe, it, expect, vi, afterEach } from 'vitest';
import { analyzeWriting, describeSourceProblems, MAX_LANGUAGE_TOOL_CHARS } from '../writingAssist';

const LT = 'https://api.languagetool.org/v2/check';
const AI = 'https://example.supabase.co/functions/v1/writing-assist';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(handlers: Record<string, () => Response | Promise<Response>>) {
  const fn = vi.fn(async (url: string) => {
    const handler = handlers[url];
    if (!handler) throw new TypeError(`unexpected fetch ${url}`);
    return handler();
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const ltMatch = (offset: number, length: number, replacement: string) => ({
  offset, length, message: 'Possible spelling mistake', replacements: [{ value: replacement }],
  rule: { issueType: 'misspelling', category: { id: 'TYPOS' } },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('analyzeWriting', () => {
  it('keeps offsets relative to the untrimmed text', async () => {
    // A document that starts with an empty paragraph has a leading newline.
    mockFetch({ [LT]: () => jsonResponse({ matches: [ltMatch(1, 3, 'The')] }) });
    const { issues } = await analyzeWriting('\nTeh cat sat.', { allowRemote: true, includeSuggestions: false });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ offset: 1, length: 3, original: 'Teh', suggestions: ['The'] });
  });

  it('runs only offline checks, and says so, without consent', async () => {
    const fetchSpy = mockFetch({});
    const { issues, sources } = await analyzeWriting('We will utilize the tool.', { accessToken: 't', supabaseUrl: 'https://example.supabase.co' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(issues.some((i) => i.source === 'local' && i.original === 'utilize')).toBe(true);
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'languagetool', state: 'skipped', reason: 'consent_required' }),
      expect.objectContaining({ source: 'ai', state: 'skipped', reason: 'consent_required' }),
    ]));
    expect(describeSourceProblems(sources)).toHaveLength(2);
  });

  it('keeps offline results and reports a rate limit when the grammar service fails', async () => {
    mockFetch({ [LT]: () => jsonResponse({}, 429) });
    const { issues, sources } = await analyzeWriting('We will utilize it.', { allowRemote: true });
    expect(issues.some((i) => i.source === 'local')).toBe(true);
    expect(sources.find((s) => s.source === 'languagetool')).toMatchObject({ state: 'error', code: 'rate_limited' });
  });

  it('reports being offline instead of failing the whole check', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { sources } = await analyzeWriting('Hello there.', { allowRemote: true });
    expect(sources.find((s) => s.source === 'languagetool')).toMatchObject({ state: 'error', code: 'network' });
  });

  it('times out a hung grammar request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = analyzeWriting('Hello there.', { allowRemote: true, includeSuggestions: false });
    await vi.advanceTimersByTimeAsync(16_000);
    const { sources } = await pending;
    expect(sources.find((s) => s.source === 'languagetool')).toMatchObject({ state: 'error', code: 'timeout' });
  });

  it('refuses over-long text for the online check without sending it', async () => {
    const fetchSpy = mockFetch({});
    const { sources } = await analyzeWriting('a '.repeat(MAX_LANGUAGE_TOOL_CHARS), { allowRemote: true, includeSuggestions: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sources.find((s) => s.source === 'languagetool')).toMatchObject({ state: 'error', code: 'too_long' });
  });

  it('ignores grammar matches outside the text', async () => {
    mockFetch({ [LT]: () => jsonResponse({ matches: [ltMatch(50, 3, 'x'), ltMatch(0, 5, 'Hi')] }) });
    const { issues } = await analyzeWriting('Hello', { allowRemote: true, includeSuggestions: false });
    expect(issues.map((i) => i.offset)).toEqual([0]);
  });

  it('re-anchors AI issues by their text and drops ones not in the document', async () => {
    mockFetch({
      [LT]: () => jsonResponse({ matches: [] }),
      [AI]: () => jsonResponse({
        issues: [
          { kind: 'style', message: 'Shorter', original: 'in order to', suggestions: ['to'], offset: 0 }, // wrong offset
          { kind: 'clarity', message: 'Invented', original: 'not in the text', suggestions: ['x'], offset: 2 },
          { kind: 'grammar', message: 'Wrong kind for this mode', original: 'We', suggestions: ['Us'], offset: 0 },
        ],
      }),
    });
    const text = 'We left early in order to rest.';
    const { issues, sources } = await analyzeWriting(text, { allowRemote: true, accessToken: 'token', supabaseUrl: 'https://example.supabase.co' });
    const ai = issues.filter((i) => i.source === 'ai');
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({ offset: text.indexOf('in order to'), original: 'in order to' });
    expect(sources.find((s) => s.source === 'ai')).toMatchObject({ state: 'ok', dropped: 2 });
  });

  it('shows the server-side AI error instead of an empty result', async () => {
    mockFetch({
      [LT]: () => jsonResponse({ matches: [] }),
      [AI]: () => jsonResponse({ error: { code: 'not_configured', message: 'x' } }, 503),
    });
    const { sources } = await analyzeWriting('Hello there.', { allowRemote: true, accessToken: 't', supabaseUrl: 'https://example.supabase.co' });
    expect(sources.find((s) => s.source === 'ai')).toMatchObject({ state: 'error', code: 'not_configured', message: 'AI suggestions are not set up on this server yet.' });
  });

  it('skips AI suggestions with a reason when signed out', async () => {
    mockFetch({ [LT]: () => jsonResponse({ matches: [] }) });
    const { sources } = await analyzeWriting('Hello there.', { allowRemote: true, supabaseUrl: 'https://example.supabase.co' });
    expect(sources.find((s) => s.source === 'ai')).toMatchObject({ state: 'skipped', reason: 'signed_out' });
  });

  it('rejects with AbortError when cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const pending = analyzeWriting('Hello there.', { allowRemote: true, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
