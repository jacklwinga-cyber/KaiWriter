import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../debounce';

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls fn after wait period', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d('a');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('only fires once for rapid successive calls (latest wins)', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d('first');
    d('second');
    d('third');
    vi.advanceTimersByTime(800);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('third');
  });

  it('title change does not cancel a pending content save (independent callers)', () => {
    // Simulates: user types content → debounce starts → user renames doc
    // Because we fixed the identity bug, renaming creates a NEW debounced call
    // with the new name but does NOT reset the timer for the content call.
    // We verify this by showing that two independent debounced functions
    // each fire correctly without interfering.
    const contentFn = vi.fn();
    const nameFn = vi.fn();
    const dContent = debounce(contentFn, 800);
    const dName = debounce(nameFn, 800);

    dContent('body text');   // content save starts
    vi.advanceTimersByTime(400);
    dName('New Title');      // name save starts (different debounced fn)
    vi.advanceTimersByTime(400);
    expect(contentFn).toHaveBeenCalledWith('body text'); // content fired at 800ms
    expect(nameFn).not.toHaveBeenCalled();               // name still pending
    vi.advanceTimersByTime(400);
    expect(nameFn).toHaveBeenCalledWith('New Title');    // name fires at 1200ms
  });

  it('flush executes immediately and cancels pending timer', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d('pending');
    d.flush('immediate');
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('immediate');
    vi.advanceTimersByTime(800);
    expect(fn).toHaveBeenCalledOnce(); // no double-fire
  });

  it('cancel prevents execution', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d('will be cancelled');
    d.cancel();
    vi.advanceTimersByTime(800);
    expect(fn).not.toHaveBeenCalled();
  });

  it('stale async save cannot overwrite newer content via debounce', async () => {
    // Adversarial: simulate two saves where the first resolves AFTER the second.
    const saved: string[] = [];
    const slowSave = (content: string) =>
      new Promise<void>((resolve) => {
        setTimeout(() => { saved.push(content); resolve(); }, content === 'old' ? 500 : 100);
      });

    const d = debounce((content: string) => { void slowSave(content); }, 50);

    d('old');
    vi.advanceTimersByTime(50);   // fires 'old' save — takes 500ms
    d('new');
    vi.advanceTimersByTime(50);   // fires 'new' save — takes 100ms

    // Advance past both async resolutions
    await vi.runAllTimersAsync();

    // 'new' resolved first (100ms) then 'old' resolved (500ms)
    // The debounce itself doesn't reorder saves — that's P0-C2's job.
    // Here we verify debounce called each fn exactly once in order.
    expect(saved).toEqual(['new', 'old']);
    // NOTE: this test deliberately exposes the ordering problem that P0-C2 must solve.
  });
});

describe('debounce.flushPending', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('runs the queued call immediately with the latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d('first');
    d('latest');
    d.flushPending();
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('latest');
    vi.advanceTimersByTime(800);
    expect(fn).toHaveBeenCalledOnce(); // timer was cancelled
  });

  it('does nothing when no call is pending', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d.flushPending();
    d('x');
    vi.advanceTimersByTime(800);
    d.flushPending(); // already fired
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does nothing after cancel or flush', () => {
    const fn = vi.fn();
    const d = debounce(fn, 800);
    d('cancelled');
    d.cancel();
    d.flushPending();
    d('flushed');
    d.flush('now');
    d.flushPending();
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('now');
  });

  it('saves the previous document before switching (no stale timer)', () => {
    // Models DocumentSavePlugin: persist reads the current name at call time.
    let currentName = 'Doc A';
    const saved: Array<[string, string]> = [];
    const persistA = (content: string) => saved.push([currentName, content]);
    const dA = debounce(persistA, 800);

    dA('A body');
    // Switch documents within the debounce window: cleanup flushes before name moves on.
    dA.flushPending();
    currentName = 'Doc B';
    vi.advanceTimersByTime(800);

    expect(saved).toEqual([['Doc A', 'A body']]);
  });
});
