/**
 * Offline readability statistics for English text: Flesch Reading Ease,
 * Flesch–Kincaid grade level, sentence and word counts, and reading time.
 *
 * Syllables are estimated with a vowel-group heuristic, which is accurate to
 * within about a syllable for most words. That's fine for the scores, which
 * are approximate guides anyway.
 */

export interface ReadabilityStats {
  words: number;
  sentences: number;
  paragraphs: number;
  syllables: number;
  avgWordsPerSentence: number;
  /** Sentences of 25 words or more. */
  longSentences: number;
  /** 0–100; higher is easier. Null when there's too little text to score. */
  readingEase: number | null;
  /** US school grade (Flesch–Kincaid). Null when there's too little text. */
  gradeLevel: number | null;
  /** Whole minutes at 238 words per minute, at least 1 when there is text. */
  readingMinutes: number;
  /** Plain-language band for readingEase. */
  band: string | null;
}

const WORDS_PER_MINUTE = 238;
const LONG_SENTENCE_WORDS = 25;
const MIN_WORDS_TO_SCORE = 30;

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const HAS_WORD = /[\p{L}\p{N}]/u;

/** Estimated syllables in one English word. */
export function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  // Silent endings: "makes", "jumped", "make" (but "-ted"/"-ded" keep their syllable: "created").
  w = w.replace(/(?:[^laeiouy]es|[^laeiouytd]ed|[^laeiouy]e)$/, '');
  w = w.replace(/^y/, '');
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function bandFor(score: number): string {
  if (score >= 90) return 'Very easy';
  if (score >= 70) return 'Easy';
  if (score >= 60) return 'Plain English';
  if (score >= 50) return 'Fairly difficult';
  if (score >= 30) return 'Difficult';
  return 'Very difficult';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function analyzeReadability(text: string): ReadabilityStats {
  const paragraphs = text.split(/\n+/).filter((p) => p.trim()).length;
  // Sentences: runs ending in . ! ? (or the end of a paragraph) that contain a word.
  const sentenceTexts = text
    .split(/\n+/)
    .flatMap((p) => p.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [])
    .filter((s) => HAS_WORD.test(s));

  let words = 0;
  let syllables = 0;
  let longSentences = 0;
  for (const sentence of sentenceTexts) {
    const sentenceWords = sentence.match(WORD_RE) ?? [];
    words += sentenceWords.length;
    if (sentenceWords.length >= LONG_SENTENCE_WORDS) longSentences += 1;
    for (const word of sentenceWords) syllables += countSyllables(word);
  }

  const sentences = sentenceTexts.length;
  const avgWordsPerSentence = sentences ? round1(words / sentences) : 0;
  let readingEase: number | null = null;
  let gradeLevel: number | null = null;
  if (words >= MIN_WORDS_TO_SCORE && sentences > 0) {
    const wps = words / sentences;
    const spw = syllables / words;
    readingEase = Math.round(Math.min(100, Math.max(0, 206.835 - 1.015 * wps - 84.6 * spw)));
    gradeLevel = round1(Math.max(0, 0.39 * wps + 11.8 * spw - 15.59));
  }

  return {
    words,
    sentences,
    paragraphs,
    syllables,
    avgWordsPerSentence,
    longSentences,
    readingEase,
    gradeLevel,
    readingMinutes: words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0,
    band: readingEase === null ? null : bandFor(readingEase),
  };
}
