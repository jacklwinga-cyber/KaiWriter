/**
 * Debounce utility with an explicit .flush() to force immediate execution.
 * Extracted from DocumentSavePlugin so it can be unit-tested independently.
 */
export interface DebouncedFn<T extends (...args: Parameters<T>) => void> {
  (...args: Parameters<T>): void;
  /** Execute immediately, cancelling any pending timer. */
  flush(...args: Parameters<T>): void;
  /** Cancel without executing. */
  cancel(): void;
}

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  waitMs: number,
): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };

  debounced.flush = (...args: Parameters<T>) => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced as DebouncedFn<T>;
}
