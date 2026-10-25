import { describe, it, expect } from 'vitest';
import {
  addDictionaryWord,
  filterByDictionary,
  isValidDictionaryWord,
  loadDictionary,
  normalizeWord,
  removeDictionaryWord,
} from '../personalDictionary';

describe('personalDictionary', () => {
  it('adds, de-duplicates and removes words per user', () => {
    expect(addDictionaryWord('u1', 'Prowire')).toEqual(['Prowire']);
    expect(addDictionaryWord('u1', 'prowire')).toEqual(['Prowire']); // same word
    expect(addDictionaryWord('u1', '“KaiHub,”')).toEqual(['KaiHub', 'Prowire']); // punctuation stripped
    expect(loadDictionary('u2')).toEqual([]); // other users unaffected
    expect(removeDictionaryWord('u1', 'PROWIRE')).toEqual(['KaiHub']);
    expect(loadDictionary('u1')).toEqual(['KaiHub']);
  });

  it('rejects phrases, empty input and over-long words', () => {
    expect(isValidDictionaryWord('two words')).toBe(false);
    expect(isValidDictionaryWord('   ')).toBe(false);
    expect(isValidDictionaryWord('a'.repeat(65))).toBe(false);
    expect(isValidDictionaryWord("o'clock")).toBe(true);
    expect(isValidDictionaryWord('Zürich')).toBe(true);
    expect(addDictionaryWord('u3', 'two words')).toEqual([]);
  });

  it('matches regardless of case and apostrophe style', () => {
    expect(normalizeWord('Jackson’s')).toBe(normalizeWord("jackson's"));
  });

  it('filters only spelling issues for dictionary words', () => {
    const issues = [
      { kind: 'spelling', original: 'Prowire' },
      { kind: 'spelling', original: 'teh' },
      { kind: 'style', original: 'Prowire' },
    ];
    expect(filterByDictionary(issues, ['prowire'])).toEqual([
      { kind: 'spelling', original: 'teh' },
      { kind: 'style', original: 'Prowire' },
    ]);
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('kaiwriter-personal-dictionary:u4', '{not json');
    expect(loadDictionary('u4')).toEqual([]);
    localStorage.setItem('kaiwriter-personal-dictionary:u4', JSON.stringify(['ok', 42, 'two words']));
    expect(loadDictionary('u4')).toEqual(['ok']);
  });
});
