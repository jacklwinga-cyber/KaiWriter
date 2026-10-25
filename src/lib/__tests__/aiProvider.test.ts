import { describe, it, expect } from 'vitest';
import {
  completeWithFallback,
  parseModelChain,
  ProviderError,
  type AiProvider,
  type CompletionRequest,
  type ProviderFailure,
} from '../../../supabase/functions/_shared/aiProvider';

const REQUEST: CompletionRequest = { system: 's', user: 'u', maxTokens: 10 };

/** A provider whose replies are scripted per model: a failure, or text. */
function scripted(script: Record<string, Array<ProviderFailure | string | Error>>) {
  const calls: Array<{ model: string; timeoutMs: number }> = [];
  const provider: AiProvider = {
    name: 'test',
    async complete(model, _request, timeoutMs) {
      calls.push({ model, timeoutMs });
      const next = script[model]?.shift();
      if (next instanceof Error) throw next;
      if (next === undefined) throw new ProviderError('upstream');
      if (next.startsWith('ok:')) return { text: next.slice(3), model, inputTokens: 10, outputTokens: 5 };
      throw new ProviderError(next as ProviderFailure, { inputTokens: next === 'truncated' ? 7 : 0, outputTokens: next === 'truncated' ? 3 : 0 });
    },
  };
  return { provider, calls };
}

function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

describe('parseModelChain', () => {
  it('uses the default when no model is set, then the fallbacks in order', () => {
    expect(parseModelChain(undefined, undefined, 'default-model')).toEqual(['default-model']);
    expect(parseModelChain(' primary ', 'b, c ,,b', 'default-model')).toEqual(['primary', 'b', 'c']);
  });

  it('drops malformed ids and caps the chain', () => {
    expect(parseModelChain('a', 'bad id, $x, b, c, d, e', 'z')).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('completeWithFallback', () => {
  it('returns the first model’s answer', async () => {
    const { provider, calls } = scripted({ m1: ['ok:hello'] });
    const result = await completeWithFallback([{ provider, model: 'm1' }], REQUEST);
    expect(result).toMatchObject({ text: 'hello', model: 'm1', attempts: 1, fellBack: false, totalInputTokens: 10 });
    expect(calls).toHaveLength(1);
  });

  it('falls back to the next model when one is unavailable (e.g. retired)', async () => {
    const { provider, calls } = scripted({ old: ['model_unavailable'], next: ['ok:fine'] });
    const c = clock();
    const result = await completeWithFallback(
      [{ provider, model: 'old' }, { provider, model: 'next' }],
      REQUEST,
      { now: c.now, sleep: c.sleep },
    );
    expect(result).toMatchObject({ text: 'fine', model: 'next', fellBack: true, attempts: 2 });
    expect(calls.map((x) => x.model)).toEqual(['old', 'next']);
    expect(c.sleeps).toEqual([]); // not worth retrying the same unavailable model
  });

  it('retries transient failures with bounded exponential backoff, then moves on', async () => {
    const { provider, calls } = scripted({ a: ['overloaded', 'overloaded', 'overloaded'], b: ['rate_limited', 'ok:done'] });
    const c = clock();
    const result = await completeWithFallback(
      [{ provider, model: 'a' }, { provider, model: 'b' }],
      REQUEST,
      { retries: 2, baseDelayMs: 500, maxDelayMs: 800, budgetMs: 60_000, now: c.now, sleep: c.sleep },
    );
    expect(result.text).toBe('done');
    expect(calls.map((x) => x.model)).toEqual(['a', 'a', 'a', 'b', 'b']);
    expect(c.sleeps).toEqual([500, 800, 500]);
  });

  it('does not retry or fall back on refusals, truncation or credential errors', async () => {
    for (const failure of ['refused', 'truncated', 'auth', 'bad_request'] as const) {
      const { provider, calls } = scripted({ a: [failure], b: ['ok:x'] });
      await expect(completeWithFallback([{ provider, model: 'a' }, { provider, model: 'b' }], REQUEST))
        .rejects.toMatchObject({ failure });
      expect(calls).toHaveLength(1);
    }
  });

  it('reports the tokens spent by failed attempts', async () => {
    const { provider } = scripted({ a: ['truncated'] });
    await expect(completeWithFallback([{ provider, model: 'a' }], REQUEST))
      .rejects.toMatchObject({ failure: 'truncated', inputTokens: 7, outputTokens: 3 });
  });

  it('stops when the time budget runs out and never invents a result', async () => {
    const c = clock();
    const slow: AiProvider = {
      name: 'slow',
      async complete() {
        c.advance(9_000);
        throw new ProviderError('timeout');
      },
    };
    const routes = ['a', 'b', 'c'].map((model) => ({ provider: slow, model }));
    await expect(completeWithFallback(routes, REQUEST, { budgetMs: 20_000, retries: 0, now: c.now, sleep: c.sleep }))
      .rejects.toMatchObject({ failure: 'timeout' });
    expect(c.now()).toBeLessThanOrEqual(20_000);
  });

  it('gives each attempt no more time than is left', async () => {
    const { provider, calls } = scripted({ a: ['ok:x'] });
    await completeWithFallback([{ provider, model: 'a' }], REQUEST, { budgetMs: 10_000, attemptTimeoutMs: 25_000 });
    expect(calls[0].timeoutMs).toBeLessThanOrEqual(10_000);
  });

  it('treats unexpected errors as upstream failures', async () => {
    const { provider } = scripted({ a: [new Error('boom')] });
    await expect(completeWithFallback([{ provider, model: 'a' }], REQUEST, { retries: 0 }))
      .rejects.toMatchObject({ failure: 'upstream' });
  });

  it('fails clearly with no models configured', async () => {
    await expect(completeWithFallback([], REQUEST)).rejects.toMatchObject({ failure: 'model_unavailable' });
  });
});
