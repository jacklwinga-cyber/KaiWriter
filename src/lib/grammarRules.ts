/**
 * Offline English grammar, punctuation and consistency rules.
 *
 * Every rule is tuned for precision over recall: it should rarely flag
 * correct writing, even if that means missing some errors (LanguageTool and
 * the AI catch more when online checks are allowed). Rules return findings
 * with exact offsets into the text they were given.
 */
import type { WritingIssueKind } from '../../supabase/functions/_shared/writingAssistCore';

export interface GrammarFinding {
  rule: string;
  kind: WritingIssueKind;
  message: string;
  offset: number;
  length: number;
  original: string;
  suggestions: string[];
}

/** Keep the case of the first letter of `original` in `replacement`. */
function matchCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement;
  if (original.length > 1 && original === original.toUpperCase() && /\p{L}{2}/u.test(original)) return replacement.toUpperCase();
  return original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;
}

// ---------------------------------------------------------------- a / an

/** Vowel letters that sound like consonants ("a university", "a one-off", "a European"). */
const CONSONANT_SOUND_PREFIXES = /^(?:uni(?!m|n|d)|use|usu|uti|ura|uri|ure|uro|ubiq|ukr|ukulele|u-|eu|ewe|one\b|one-|once)/i;
/** Silent h ("an hour"). Other h-words are left alone ("a/an historic" are both used). */
const SILENT_H = /^(?:hour|honest|honor|honour|heir)/i;
/** Letters whose names start with a vowel sound, for acronyms ("an FBI", "an MBA"). */
const VOWEL_SOUND_LETTERS = new Set(['A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X']);
/** "a" used as a letter or label ("plan a or plan b", "vitamin A and C"). */
const NOT_A_NOUN_PHRASE = new Set(['and', 'or', 'to', 'of', 'is', 'in', 'the', 'was', 'as', 'on', 'for', 'at', 'by', 'with', 'nor', 'but']);

function expectsAn(word: string): boolean | null {
  if (/^\d/.test(word)) return null; // numbers: "an 8", "a 9" — leave alone
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (!letters) return null;
  // A letter name: "an X-ray", "a T-shirt", and two-letter abbreviations ("an HR team", "a UK firm").
  // Longer acronyms are often said as words ("a NATO member"), so they're left alone.
  if (/^[A-Z]-/.test(word) || /^[A-Z]{2}$/.test(word)) return VOWEL_SOUND_LETTERS.has(word[0]);
  if (letters.length >= 3 && letters === letters.toUpperCase() && /^[A-Z]+$/.test(letters)) return null;
  if (SILENT_H.test(word)) return true;
  if (/^h/i.test(word)) return null;
  if (CONSONANT_SOUND_PREFIXES.test(word)) return false;
  return /^[aeiou]/i.test(word);
}

function articleRule(text: string, out: GrammarFinding[]) {
  for (const m of text.matchAll(/(?<![\p{L}\p{N}'’.-])(a|an)\s+([\p{L}\p{N}][\p{L}\p{N}'’-]*)/giu)) {
    const [, article, word] = m;
    if (NOT_A_NOUN_PHRASE.has(word.toLowerCase())) continue;
    if (article === 'A' && /^[A-Z]$/.test(word)) continue; // "A B C"
    const wantAn = expectsAn(word);
    if (wantAn === null) continue;
    const isAn = article.toLowerCase() === 'an';
    if (wantAn === isAn) continue;
    const fixed = matchCase(article, wantAn ? 'an' : 'a');
    out.push({
      rule: 'article',
      kind: 'grammar',
      message: wantAn ? `Use “an” before a vowel sound (“an ${word}”).` : `Use “a” before a consonant sound (“a ${word}”).`,
      offset: m.index ?? 0,
      length: article.length,
      original: article,
      suggestions: [fixed],
    });
  }
}

// ---------------------------------------------------------------- agreement and confusions

/** Words before "he have" that make it correct ("did he have", "let her have"). */
const AUXILIARY_BEFORE = /(?:^|[^\p{L}])(?:do|does|did|will|would|could|should|might|must|can|may|shall|to|let|make|makes|made|help|helps|helped|hear|see|saw|watch|why|not|n't|that|lest)\s+$/iu;
/** A capitalised word before "I" ("Part I is", "World War I is"): the I is probably a numeral. */
const CAPITALISED_BEFORE = /\p{Lu}[\p{L}]*\s+$/u;
/** Words after "then" that show it is about time or sequence ("better then worse", "better then."). */
const THEN_SEQUENCE = /^\s*(?:$|[,.;:!?)]|(?:again|later|now|on|onwards|worse|better|more|less|\p{L}+er)\b)/iu;

interface PatternRule {
  rule: string;
  kind: WritingIssueKind;
  pattern: RegExp;
  /** Index of the capture group to replace. */
  group: number;
  replace: (found: string, match: RegExpMatchArray) => string | null;
  message: (found: string, fixed: string) => string;
  /** Skip a match given the text before it. */
  skipIf?: (before: string, match: RegExpMatchArray) => boolean;
  /** Skip a match given the text after it. */
  skipAfter?: (after: string) => boolean;
}

const PATTERN_RULES: PatternRule[] = [
  {
    rule: 'agreement',
    kind: 'grammar',
    pattern: /\b(he|she|it)\s+(don['’]t|dont)\b/giu,
    group: 2,
    replace: (f) => matchCase(f, f.includes('’') ? 'doesn’t' : 'doesn\'t'),
    message: (_f, fixed) => `Use “${fixed}” with he, she or it.`,
  },
  {
    rule: 'agreement',
    kind: 'grammar',
    pattern: /(?<![\p{L}'’])(I|you|we|they|You|We|They)\s+(doesn['’]t)\b/gu,
    group: 2,
    replace: (f) => matchCase(f, f.includes('’') ? 'don’t' : 'don\'t'),
    message: (_f, fixed) => `Use “${fixed}” with I, you, we or they.`,
  },
  {
    rule: 'agreement',
    kind: 'grammar',
    pattern: /\b(he|she|it)\s+(have)\b/giu,
    group: 2,
    replace: (f) => matchCase(f, 'has'),
    message: () => 'Use “has” with he, she or it.',
    skipIf: (before) => AUXILIARY_BEFORE.test(before),
  },
  {
    rule: 'agreement',
    kind: 'grammar',
    pattern: /\b(they|we|you)\s+(has)\b/giu,
    group: 2,
    replace: (f) => matchCase(f, 'have'),
    message: () => 'Use “have” with you, we or they.',
  },
  {
    rule: 'agreement',
    kind: 'grammar',
    pattern: /\b(they|we|you)\s+(was)\b/giu,
    group: 2,
    replace: (f) => matchCase(f, 'were'),
    message: () => 'Use “were” with you, we or they.',
  },
  {
    rule: 'agreement',
    kind: 'grammar',
    pattern: /\b(they|we|you)\s+(is)\b/giu,
    group: 2,
    replace: (f) => matchCase(f, 'are'),
    message: () => 'Use “are” with you, we or they.',
  },
  {
    rule: 'agreement',
    kind: 'grammar',
    pattern: /(?<![\p{L}'’])(I)\s+(is|are)\b/gu,
    group: 2,
    replace: (f) => matchCase(f, 'am'),
    message: () => 'Use “am” with I.',
    skipIf: (before) => CAPITALISED_BEFORE.test(before),
  },
  {
    rule: 'agreement',
    kind: 'grammar',
    pattern: /\b(he|she)\s+(are)\b/giu,
    group: 2,
    replace: (f) => matchCase(f, 'is'),
    message: () => 'Use “is” with he or she.',
  },
  {
    rule: 'modal-of',
    kind: 'grammar',
    // Not "might" or "may": "the might of", "in May of 2020". Not "could of course".
    pattern: /\b(could|should|would|must)\s+(of)\b(?!\s+course\b)/giu,
    group: 2,
    replace: (f) => matchCase(f, 'have'),
    message: (_f, fixed) => `“${fixed}”, not “of”, after could, should, would or must.`,
  },
  {
    rule: 'than-then',
    kind: 'grammar',
    pattern: /\b(more|less|better|worse|rather|greater|fewer|larger|smaller|higher|lower|faster|slower|easier|harder|other)\s+(then)\b/giu,
    group: 2,
    replace: (f) => matchCase(f, 'than'),
    message: () => 'Use “than” for comparisons (“then” is about time).',
    skipAfter: (after) => THEN_SEQUENCE.test(after),
  },
  {
    rule: 'its-its',
    kind: 'grammar',
    pattern: /\b(its)\s+(?:a|an|the|been)\b/giu,
    group: 1,
    replace: (f) => matchCase(f, 'it’s'),
    message: () => '“It’s” means “it is” or “it has”; “its” is possessive.',
  },
  {
    rule: 'its-its',
    kind: 'grammar',
    pattern: /\b(it['’]s)\s+own\b/giu,
    group: 1,
    replace: (f) => matchCase(f, 'its'),
    message: () => 'The possessive is “its” (no apostrophe).',
  },
  {
    rule: 'your-youre',
    kind: 'grammar',
    // Not "your welcome pack".
    pattern: /\b(your)\s+welcome\b(?=\s*(?:$|[.!,;)]))/giu,
    group: 1,
    replace: (f) => matchCase(f, 'you’re'),
    message: () => '“You’re welcome” (you are).',
  },
  {
    rule: 'alot',
    kind: 'spelling',
    pattern: /\b(alot)\b/giu,
    group: 1,
    replace: (f) => matchCase(f, 'a lot'),
    message: () => '“A lot” is two words.',
  },
];

function patternRules(text: string, out: GrammarFinding[]) {
  for (const rule of PATTERN_RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const found = m[rule.group];
      if (found === undefined) continue;
      const start = m.index ?? 0;
      if (rule.skipIf?.(text.slice(Math.max(0, start - 20), start), m)) continue;
      const end = start + m[0].length;
      if (rule.skipAfter?.(text.slice(end, end + 20))) continue;
      const fixed = rule.replace(found, m);
      if (!fixed || fixed === found) continue;
      const offset = start + m[0].indexOf(found, rule.group === 1 ? 0 : m[1].length);
      out.push({
        rule: rule.rule,
        kind: rule.kind,
        message: rule.message(found, fixed),
        offset,
        length: found.length,
        original: found,
        suggestions: [fixed],
      });
    }
  }
}

// ---------------------------------------------------------------- punctuation and spacing

/** True if `offset` is inside a URL, email address, path or code-like token. */
function inUrlLike(text: string, offset: number): boolean {
  let start = offset;
  while (start > 0 && !/\s/.test(text[start - 1])) start -= 1;
  let end = offset;
  while (end < text.length && !/\s/.test(text[end])) end += 1;
  return /[/@&=_\\#<>{}[\]]|:\/\/|www\./.test(text.slice(start, end));
}

function punctuationRules(text: string, out: GrammarFinding[]) {
  // Space before punctuation: "word ," → "word,". Not ellipses or line starts.
  for (const m of text.matchAll(/(?<=[\p{L}\p{N})”’"])( +)([,;:!?]|\.(?!\.))(?=\s|["”’]|$)/gu)) {
    out.push({
      rule: 'space-before-punctuation',
      kind: 'punctuation',
      message: `No space before “${m[2]}”.`,
      offset: m.index ?? 0,
      length: m[0].length,
      original: m[0],
      suggestions: [m[2]],
    });
  }
  // Missing space after punctuation between words: "end.Next", "this,that".
  for (const m of text.matchAll(/(?<=\p{Ll}{2})([.!?])(?=\p{Lu}\p{Ll})|(?<=\p{L}{2})([,;])(?=\p{L}{2})/gu)) {
    const mark = m[1] ?? m[2];
    if (inUrlLike(text, m.index ?? 0)) continue;
    out.push({
      rule: 'space-after-punctuation',
      kind: 'punctuation',
      message: `Add a space after “${mark}”.`,
      offset: m.index ?? 0,
      length: 1,
      original: mark,
      suggestions: [`${mark} `],
    });
  }
  // Doubled commas, or two full stops that aren't an ellipsis.
  for (const m of text.matchAll(/,{2,}|(?<![./\\])\.\.(?![./\\])/g)) {
    const mark = m[0][0];
    out.push({
      rule: 'doubled-punctuation',
      kind: 'punctuation',
      message: `Doubled “${mark}”.`,
      offset: m.index ?? 0,
      length: m[0].length,
      original: m[0],
      suggestions: [mark],
    });
  }
  // Several spaces between words (not indentation, and not the two spaces
  // some writers deliberately put after a sentence).
  for (const m of text.matchAll(/(?<=[^\s.!?:;)"”’])( {2,})(?=\S)/g)) {
    out.push({
      rule: 'extra-space',
      kind: 'punctuation',
      message: 'Extra space between words.',
      offset: m.index ?? 0,
      length: m[0].length,
      original: m[0],
      suggestions: [' '],
    });
  }
}

// ---------------------------------------------------------------- capitalisation

const ABBREVIATIONS = /(?:^|[^\p{L}])(?:e\.g|i\.e|etc|vs|cf|approx|incl|esp|mr|mrs|ms|dr|prof|st|no|fig|vol|pp|p|ed|al|ca|co|inc|ltd|jr|sr|dept|est|min|max|ft|in|oz|lb|a\.m|p\.m)\.$/iu;

function capitalisationRules(text: string, out: GrammarFinding[]) {
  // Lower-case pronoun "i".
  for (const m of text.matchAll(/(?<![\p{L}\p{N}'’.\-_/])i(?=\s|['’](?:m|ve|ll|d)\b)/gu)) {
    out.push({
      rule: 'pronoun-i',
      kind: 'grammar',
      message: 'Capitalise the pronoun “I”.',
      offset: m.index ?? 0,
      length: 1,
      original: 'i',
      suggestions: ['I'],
    });
  }
  // A sentence that starts with a lower-case word after . ! or ? on the same line.
  for (const m of text.matchAll(/([.!?])([ \t]+)(\p{Ll}[\p{Ll}'’]*)(?=[\s,;:.!?]|$)/gu)) {
    const start = m.index ?? 0;
    const before = text.slice(Math.max(0, start - 12), start + 1);
    if (m[1] === '.' && (ABBREVIATIONS.test(before) || text[start - 1] === '.')) continue; // "e.g. the", "..."
    if (/[\p{L}\p{N}]\.\p{L}/u.test(before.slice(-4))) continue; // "a.m. on", initials
    const word = m[3];
    const offset = start + m[1].length + m[2].length;
    out.push({
      rule: 'sentence-capital',
      kind: 'grammar',
      message: 'Start a sentence with a capital letter.',
      offset,
      length: word.length,
      original: word,
      suggestions: [word[0].toUpperCase() + word.slice(1)],
    });
  }
}

// ---------------------------------------------------------------- comma splices and fragments

const CONJUNCTIVE_ADVERBS = 'therefore|moreover|consequently|nevertheless|furthermore';
const SUBJECT_START = '(?:I|we|you|he|she|it|they|this|that|there|these|those|the|our|my|your|his|her|their|its)\\b';
/**
 * "however" can also mean "no matter how" ("we'll go, however it turns out"),
 * so it's only flagged before a pronoun and a verb that isn't one of those.
 */
const HOWEVER_SPLICE = /,\s+(however)\s+(?=(?:I|we|you|he|she|they)\s+(?!(?:want|wants|wanted|like|likes|liked|choose|chooses|chose|wish|wishes|please|pleases|decide|decides|decided|see|sees|feel|feels|look|looks|turn|turns|go|goes|may|might|can|could|try|tries)\b)\p{L})/giu;

function sentenceRules(text: string, out: GrammarFinding[]) {
  const splice = new RegExp(`,\\s+(${CONJUNCTIVE_ADVERBS})\\s+(?=${SUBJECT_START})`, 'giu');
  for (const m of [...text.matchAll(splice), ...text.matchAll(HOWEVER_SPLICE)]) {
    const word = m[1];
    out.push({
      rule: 'comma-splice',
      kind: 'punctuation',
      message: `“${word}” joins two sentences here: use a semicolon before it and a comma after it.`,
      offset: m.index ?? 0,
      length: m[0].length,
      original: m[0],
      suggestions: [`; ${word.toLowerCase()}, `],
    });
  }

  // Short sentences that start with a subordinating conjunction and seem to
  // have no main clause: no comma, and no second subject pronoun.
  const fragment = /(?<=^|[.!?]\s+|\n)(Because|Although|Though|Whereas|Even though)\b[^.!?\n]*[.!]/gu;
  for (const m of text.matchAll(fragment)) {
    const sentence = m[0];
    const words = sentence.split(/\s+/).filter(Boolean).length;
    if (words < 3 || words > 12 || /[,;:—–]/.test(sentence)) continue;
    const subjects = sentence.match(/\b(?:I|we|you|he|she|it|they)\b/giu)?.length ?? 0;
    if (subjects > (/^Because of\b/i.test(sentence) ? 0 : 1)) continue;
    out.push({
      rule: 'fragment',
      kind: 'clarity',
      message: `Possible sentence fragment: a sentence starting with “${m[1]}” usually needs a main clause. Join it to the next or previous sentence.`,
      offset: m.index ?? 0,
      length: sentence.length,
      original: sentence,
      suggestions: [],
    });
  }
}

// ---------------------------------------------------------------- consistency

/** Equivalent spellings where a document should pick one. */
const VARIANT_GROUPS: string[][] = [
  ['email', 'e-mail'],
  ['online', 'on-line'],
  ['website', 'web site'],
  ['okay', 'OK'],
  ['toward', 'towards'],
  ['afterward', 'afterwards'],
  ['percent', 'per cent'],
  ['login', 'log-in'],
  ['setup', 'set-up'],
  ['healthcare', 'health care'],
  ['ecommerce', 'e-commerce'],
];
const MAX_CONSISTENCY_FINDINGS = 10;

function wordRegex(word: string, flags: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[- ]/g, (c) => (c === ' ' ? '\\s+' : '-'));
  return new RegExp(`(?<![\\p{L}\\p{N}-])${escaped}(?![\\p{L}\\p{N}-])`, flags);
}

function consistencyRules(text: string, out: GrammarFinding[]) {
  const groups: string[][] = [...VARIANT_GROUPS];
  // Any hyphenated word that also appears closed up ("follow-up" and "followup").
  const seen = new Set<string>();
  for (const m of text.matchAll(/(?<![\p{L}\p{N}-])(\p{L}{2,})-(\p{L}{2,})(?![\p{L}\p{N}-])/gu)) {
    const hyphenated = m[0].toLowerCase();
    // "re-sign"/"resign", "co-op"/"coop" are different words.
    if (seen.has(hyphenated) || seen.size >= 100 || /^(?:re|co)$/i.test(m[1])) continue;
    seen.add(hyphenated);
    const closed = (m[1] + m[2]).toLowerCase();
    if (!VARIANT_GROUPS.some((g) => g.includes(closed))) groups.push([closed, hyphenated]);
  }

  let count = 0;
  for (const group of groups) {
    const uses = group.map((form) => {
      // "OK" is matched case-sensitively so "ok" in other senses isn't counted.
      const flags = form === 'OK' ? 'gu' : 'giu';
      return [...text.matchAll(wordRegex(form, flags))];
    });
    const used = uses.filter((u) => u.length > 0);
    if (used.length < 2) continue;
    // Keep the most common form (on a tie, the one used first).
    const firstIndex = (u: RegExpMatchArray[]) => (u.length ? u[0].index ?? 0 : Infinity);
    let keep = 0;
    uses.forEach((u, i) => {
      const best = uses[keep];
      if (u.length > best.length || (u.length === best.length && firstIndex(u) < firstIndex(best))) keep = i;
    });
    const preferred = group[keep];
    uses.forEach((u, i) => {
      if (i === keep) return;
      for (const m of u) {
        if (count >= MAX_CONSISTENCY_FINDINGS) return;
        count += 1;
        out.push({
          rule: 'consistency',
          kind: 'style',
          message: `This document also uses “${preferred}”. Pick one spelling and use it throughout.`,
          offset: m.index ?? 0,
          length: m[0].length,
          original: m[0],
          suggestions: [matchCase(m[0], preferred)],
        });
      }
    });
  }
}

// ---------------------------------------------------------------- entry point

/** All offline English grammar findings for `text`, in document order. */
export function englishGrammarFindings(text: string): GrammarFinding[] {
  const out: GrammarFinding[] = [];
  articleRule(text, out);
  patternRules(text, out);
  punctuationRules(text, out);
  capitalisationRules(text, out);
  sentenceRules(text, out);
  consistencyRules(text, out);
  return out.sort((a, b) => a.offset - b.offset || a.length - b.length);
}
