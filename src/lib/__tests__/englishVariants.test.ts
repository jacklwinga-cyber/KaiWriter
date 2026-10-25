import { describe, it, expect } from 'vitest';
import { englishVariantFor, findVariantSpellings } from '../englishVariants';
import { localClarityIssues } from '../writingAssist';

describe('englishVariants', () => {
  it('flags US spellings in UK English, keeping capitalisation', () => {
    const text = 'Our favorite Color is gray; the CENTER traveled far.';
    expect(findVariantSpellings(text, 'en-GB').map((m) => [m.original, m.replacement])).toEqual([
      ['favorite', 'favourite'],
      ['Color', 'Colour'],
      ['gray', 'grey'],
      ['CENTER', 'CENTRE'],
      ['traveled', 'travelled'],
    ]);
  });

  it('flags UK spellings in US English', () => {
    expect(findVariantSpellings('The theatre programme was colourful.', 'en-US').map((m) => m.replacement)).toEqual([
      'theater',
      'colorful', // "programme" is left alone: it depends on meaning
    ]);
  });

  it('gives positions that match the text', () => {
    const text = 'A neighbour’s behaviour.';
    for (const m of findVariantSpellings(text, 'en-US')) {
      expect(text.slice(m.offset, m.offset + m.length)).toBe(m.original);
    }
  });

  it('ignores -ize/-ise and words inside other words', () => {
    expect(findVariantSpellings('We organize the colorimeter.', 'en-GB')).toEqual([]);
  });

  it('maps proofing locales to a variety', () => {
    expect(englishVariantFor('en-GB')).toBe('en-GB');
    expect(englishVariantFor('en-AU')).toBe('en-GB');
    expect(englishVariantFor('en-US')).toBe('en-US');
    expect(englishVariantFor('en-CA')).toBeNull();
    expect(englishVariantFor('fr')).toBeNull();
  });
});

describe('localClarityIssues — locale', () => {
  it('reports UK spellings as spelling issues for en-GB', () => {
    const issues = localClarityIssues('My favorite color.', 'en-GB');
    expect(issues.filter((i) => i.kind === 'spelling').map((i) => i.suggestions[0])).toEqual(['favourite', 'colour']);
  });

  it('runs only language-independent checks for non-English text', () => {
    const issues = localClarityIssues('Nous allons utilize le le projet in order to finir.', 'fr');
    expect(issues.map((i) => i.message)).toEqual(['Repeated word “le”.']);
  });

  it('finds short repeated words but allows common correct doubles', () => {
    const issues = localClarityIssues('It is a a test. I had had enough of that that.', 'en-US');
    expect(issues.filter((i) => i.message.startsWith('Repeated')).map((i) => i.original)).toEqual(['a a']);
  });
});
