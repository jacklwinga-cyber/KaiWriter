/**
 * SearchPalette — command-palette style full-text search UI (P1-B).
 *
 * Features:
 *  - Opens with Cmd+K (Mac) / Ctrl+K (Win/Linux)
 *  - Searches document titles + body content via searchDocuments()
 *  - Results show title + body snippet with match highlighting
 *  - Keyboard navigation: ↑↓ to move, Enter to open, Esc to close
 *  - Debounced search (200ms) to avoid hammering IDB on every keystroke
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FileText } from 'lucide-react';
import styles from './SearchPalette.module.css';
import type { SearchResult } from '../../lib/searchStore';

const DEBOUNCE_MS = 200;
const MAX_RESULTS = 12;

// ---------------------------------------------------------------------------
// Highlight helper — wraps query tokens in <mark> inside a string
// ---------------------------------------------------------------------------
function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim() || !text) return text;

  const tokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length); // longest first to avoid double-wrap

  if (tokens.length === 0) return text;

  // Build a regex that matches any token (case-insensitive, global)
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i}>{part}</mark> : part,
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchPalette({ isOpen, onClose }: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Debounced search
  const runSearch = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) {
      setResults([]);
      setActiveIndex(0);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    timerRef.current = setTimeout(async () => {
      const { searchDocuments } = await import('../../lib/searchStore');
      const found = await searchDocuments(q);
      setResults(found.slice(0, MAX_RESULTS));
      setActiveIndex(0);
      setIsSearching(false);
    }, DEBOUNCE_MS);
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    runSearch(q);
  };

  const openResult = useCallback(
    (result: SearchResult) => {
      navigate(`/doc/${result.documentId}`);
      onClose();
    },
    [navigate, onClose],
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[activeIndex];
      if (r) openResult(r);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={styles.palette}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search documents"
      >
        {/* ── Input ── */}
        <div className={styles.inputRow}>
          <Search size={16} className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="Search documents…"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search query"
          />
          {query && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus(); }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* ── Results ── */}
        <div
          className={styles.results}
          role="listbox"
          aria-label="Search results"
        >
          {query && !isSearching && results.length === 0 && (
            <div className={styles.empty}>
              No documents found for &ldquo;{query}&rdquo;
            </div>
          )}

          {results.map((result, idx) => (
            <div
              key={result.documentId}
              className={`${styles.resultItem} ${idx === activeIndex ? styles.active : ''}`}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => openResult(result)}
            >
              <div className={styles.resultTitle}>
                <FileText size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
                <span>{highlightText(result.name, query)}</span>
                {result.titleMatch && result.snippet === '' && (
                  <span className={styles.titleBadge}>title</span>
                )}
              </div>
              {result.snippet && (
                <div className={styles.resultSnippet}>
                  {highlightText(result.snippet, query)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Footer hints ── */}
        {results.length > 0 && (
          <div className={styles.footer}>
            <span className={styles.kbd}>
              <kbd>↑</kbd><kbd>↓</kbd> navigate
            </span>
            <span className={styles.kbd}>
              <kbd>↵</kbd> open
            </span>
            <span className={styles.kbd}>
              <kbd>Esc</kbd> close
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global keyboard shortcut hook — Cmd+K / Ctrl+K
// ---------------------------------------------------------------------------

/**
 * Attach to any component to open the search palette on Cmd+K / Ctrl+K.
 * Returns [isOpen, open, close] — wire isOpen and close into <SearchPalette />.
 */
export function useSearchPalette(): [boolean, () => void, () => void] {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return [isOpen, open, close];
}
