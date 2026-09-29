/**
 * Debounce utility with an explicit .flush() to force immediate execution.
 * Extracted from DocumentSavePlugin so it can be unit-tested independently.
 */
export interface DebouncedFn<T extends (...args: Parameters<T>) => void> {
  (...args: Parameters<T>): void;
  /** Execute immediately, cancelling any pending timer. */
  flush(...args: Parameters<T>): void;
  /** Execute now with the latest queued args, but only if a call is pending. */
  flushPending(): void;
  /** Cancel without executing. */
  cancel(): void;
}

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  waitMs: number,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingCall: (() => void) | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    pendingCall = () => fn(...args);
    timer = setTimeout(() => {
      timer = null;
      pendingCall = null;
      fn(...args);
    }, waitMs);
  };

  debounced.flush = (...args: Parameters<T>) => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingCall = null;
    fn(...args);
  };

  debounced.flushPending = () => {
    if (timer === null || pendingCall === null) return;
    const call = pendingCall;
    clearTimeout(timer);
    timer = null;
    pendingCall = null;
    call();
  };

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingCall = null;
  };

  return debounced as DebouncedFn<T>;
}
