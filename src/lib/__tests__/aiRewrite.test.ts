import { afterEach, describe, it, expect, vi } from 'vitest';
import { requestRewrite, textForRewrite } from '../aiRewrite';

const OPTS = { accessToken: 'token', supabaseUrl: 'https://example.supabase.co', anonKey: 'anon', language: 'en-GB' };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('textForRewrite', () => {
  it('separates paragraphs with a blank line and drops empty ones', () => {
    expect(textForRewrite('One.\n\nTwo.\n')).toBe('One.\n\nTwo.');
    expect(textForRewrite('  Just one.  ')).toBe('Just one.');
  });
});

describe('requestRewrite', () => {
  it('sends only the text, style and language, and returns the validated rewrite', async () => {
    const fetchMock = mockFetch(200, { rewrite: 'The plan is simple.', unchanged: false, quota: { limit: 25, remaining: 24 } });
    const result = await requestRewrite('The very plan is very simple.', 'concise', OPTS);
    expect(result).toEqual({ rewrite: 'The plan is simple.', unchanged: false, quota: { limit: 25, remaining: 24 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/functions/v1/writing-assist');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'The very plan is very simple.', mode: 'rewrite', style: 'concise', language: 'en-GB' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token');
  });

  it('shows the server’s error as a user-safe message, with the quota', async () => {
    mockFetch(429, { error: { code: 'quota_exceeded', message: 'ignored' }, quota: { limit: 25, remaining: 0 } });
    await expect(requestRewrite('Hello.', 'improve', OPTS)).rejects.toMatchObject({
      code: 'quota_exceeded',
      message: expect.stringMatching(/today’s AI requests/),
      quota: { limit: 25, remaining: 0 },
    });
  });

  it('treats unknown errors and unreadable replies as failures, never as a rewrite', async () => {
    mockFetch(500, 'gateway exploded');
    await expect(requestRewrite('Hello.', 'improve', OPTS)).rejects.toMatchObject({ code: 'upstream_error' });
    mockFetch(200, { rewrite: 42 });
    await expect(requestRewrite('Hello.', 'improve', OPTS)).rejects.toMatchObject({ code: 'invalid_response' });
    mockFetch(200, { rewrite: 'x'.repeat(5_000) });
    await expect(requestRewrite('Hello.', 'concise', OPTS)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('reports being offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(requestRewrite('Hello.', 'improve', OPTS)).rejects.toMatchObject({ code: 'network' });
  });

  it('checks the length, sign-in and configuration before sending anything', async () => {
    const fetchMock = mockFetch(200, {});
    await expect(requestRewrite('x'.repeat(6_001), 'improve', OPTS)).rejects.toMatchObject({ code: 'too_long' });
    await expect(requestRewrite('Hello.', 'improve', { ...OPTS, accessToken: null })).rejects.toMatchObject({ code: 'signed_out' });
    await expect(requestRewrite('   ', 'improve', OPTS)).rejects.toMatchObject({ code: 'empty' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('can be cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const pending = requestRewrite('Hello.', 'improve', { ...OPTS, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
