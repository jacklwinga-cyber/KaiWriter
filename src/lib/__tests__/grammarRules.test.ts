import { describe, it, expect } from 'vitest';
import { englishGrammarFindings } from '../grammarRules';

/** Findings as "rule: original -> suggestion". */
function found(text: string, rule?: string): string[] {
  return englishGrammarFindings(text)
    .filter((f) => !rule || f.rule === rule)
    .map((f) => `${f.rule}: ${f.original} -> ${f.suggestions[0] ?? ''}`);
}

/** Every finding's offsets point at its `original` text. */
function offsetsValid(text: string): boolean {
  return englishGrammarFindings(text).every((f) => text.slice(f.offset, f.offset + f.length) === f.original);
}

describe('a / an', () => {
  it('catches the wrong article', () => {
    expect(found('She ate a apple and an banana.', 'article')).toEqual(['article: a -> an', 'article: an -> a']);
    expect(found('It took a hour. A honest answer.', 'article')).toEqual(['article: a -> an', 'article: A -> An']);
    expect(found('He is a HR manager with an UK firm.', 'article')).toEqual(['article: a -> an', 'article: an -> a']);
    expect(found('We need an university and an one-off fee.', 'article')).toEqual(['article: an -> a', 'article: an -> a']);
  });

  it('leaves correct and uncertain uses alone', () => {
    const ok = [
      'A university, a European, a one-time fee, a useful tool, a united front, a unilateral move, a U-turn.',
      'An umbrella, an unimportant detail, an uninstalled app, an unidentified caller, an only child, an onerous task.',
      'An X-ray, a T-shirt, an MBA? No: a NATO member, a NASA mission, an SQL query, a SQL query.',
      'A historic day and an historic day are both used. An hour, an heir, an honour.',
      'Plan a or plan b. Vitamin A and C. A 9-year-old and an 8-year-old.',
    ];
    for (const text of ok) expect(found(text, 'article'), text).toEqual([]);
  });
});

describe('agreement and confusions', () => {
  it('catches pronoun agreement errors', () => {
    expect(found('He don’t know. They doesn\'t care. She have a car. They has left.')).toEqual([
      'agreement: don’t -> doesn’t',
      'agreement: doesn\'t -> don\'t',
      'agreement: have -> has',
      'agreement: has -> have',
    ]);
    expect(found('We was late and you is early. I is here. He are tired.', 'agreement')).toEqual([
      'agreement: was -> were',
      'agreement: is -> are',
      'agreement: is -> am',
      'agreement: are -> is',
    ]);
  });

  it('allows questions, modals, subjunctives and numerals', () => {
    const ok = [
      'Did he have time? Does she have a car? Would it have helped? Let her have it.',
      'They insisted that he have access to the files.',
      'Part I is an introduction. World War I is covered in chapter two.',
      'If he were taller, he would play. They were late; we were early.',
    ];
    for (const text of ok) expect(found(text, 'agreement'), text).toEqual([]);
  });

  it('catches common confusions', () => {
    expect(found('I could of gone. You should of asked.', 'modal-of')).toEqual(['modal-of: of -> have', 'modal-of: of -> have']);
    expect(found('This is better then that, and more then enough.', 'than-then')).toEqual(['than-then: then -> than', 'than-then: then -> than']);
    expect(found('Its a nice day. The firm has it\'s own office.', 'its-its')).toEqual(['its-its: Its -> It’s', 'its-its: it\'s -> its']);
    expect(found('Thanks! Your welcome.', 'your-youre')).toEqual(['your-youre: Your -> You’re']);
    expect(found('We have alot to do.', 'alot')).toEqual(['alot: alot -> a lot']);
  });

  it('leaves the correct meanings alone', () => {
    const ok = [
      'I could of course leave. The might of the army. In May of 2020 we moved.',
      'Things were better then. It got worse then better. Prices went higher then lower again.',
      'The company changed its name. Its only purpose is clarity. It’s a good day.',
      'Open your welcome pack. Read your welcome email first.',
    ];
    for (const text of ok) {
      expect(found(text).filter((f) => /modal-of|than-then|its-its|your-youre/.test(f)), text).toEqual([]);
    }
  });
});

describe('punctuation and spacing', () => {
  it('catches spacing and doubled punctuation', () => {
    expect(found('Hello , world . Is it ? Yes !', 'space-before-punctuation')).toEqual([
      'space-before-punctuation:  , -> ,',
      'space-before-punctuation:  . -> .',
      'space-before-punctuation:  ? -> ?',
      'space-before-punctuation:  ! -> !',
    ]);
    expect(found('It ended.Then it began. Red,green and blue.', 'space-after-punctuation')).toEqual([
      'space-after-punctuation: . -> . ',
      'space-after-punctuation: , -> , ',
    ]);
    expect(found('Wait,, what.. really', 'doubled-punctuation')).toEqual([
      'doubled-punctuation: ,, -> ,',
      'doubled-punctuation: .. -> .',
    ]);
    expect(found('Too  many spaces here.', 'extra-space')).toEqual(['extra-space:    ->  ']);
  });

  it('leaves ellipses, URLs, numbers, paths and sentence spacing alone', () => {
    const ok = [
      'Wait... what? Visit example.com or https://example.com/a,b;c?x=1&y=2 today.',
      'It costs 1,000.50 dollars. See ../docs for more. Email me at a.b@example.com.',
      'One sentence.  Two spaces after it is a style choice. Smile :) please.',
    ];
    for (const text of ok) expect(found(text).filter((f) => /punctuation|extra-space/.test(f)), text).toEqual([]);
  });
});

describe('capitalisation', () => {
  it('catches a lower-case "i" and sentence starts', () => {
    expect(found('Yesterday i went home. i’m tired.', 'pronoun-i')).toEqual(['pronoun-i: i -> I', 'pronoun-i: i -> I']);
    expect(found('It rained. the match was off. why? nobody knew.', 'sentence-capital')).toEqual([
      'sentence-capital: the -> The',
      'sentence-capital: why -> Why',
      'sentence-capital: nobody -> Nobody',
    ]);
  });

  it('leaves abbreviations, brand names and list labels alone', () => {
    const ok = [
      'Bring fruit, e.g. apples, i.e. the red ones, etc. and so on.',
      'We met at 3 p.m. on Friday. Dr. smith is a typo we leave alone. Buy an iPhone. Use eBay.',
      'Options: (i) first, (ii) second. Wait... then go.',
    ];
    for (const text of ok) expect(found(text).filter((f) => /pronoun-i|sentence-capital/.test(f)), text).toEqual([]);
  });
});

describe('comma splices and fragments', () => {
  it('catches a comma splice with a conjunctive adverb', () => {
    expect(found('It rained, however we went out. Sales fell, therefore the plan changed.', 'comma-splice')).toEqual([
      'comma-splice: , however  -> ; however, ',
      'comma-splice: , therefore  -> ; therefore, ',
    ]);
  });

  it('allows "however" meaning "no matter how"', () => {
    expect(found('We will go, however it turns out. Do it, however you like.', 'comma-splice')).toEqual([]);
  });

  it('flags likely fragments only', () => {
    expect(found('We stayed in. Because it was raining.', 'fragment')).toHaveLength(1);
    expect(found('Because of the rain.', 'fragment')).toHaveLength(1);
    const ok = 'Because it rained, we stayed. Because it rained we stayed in. Although tired, she won. Why? Because.';
    expect(found(ok, 'fragment')).toEqual([]);
  });
});

describe('consistency', () => {
  it('flags the less common of two spellings', () => {
    expect(found('Send an email. Check your email. Reply by e-mail.', 'consistency')).toEqual(['consistency: e-mail -> email']);
    expect(found('Book a follow-up. The followup is Monday. Another follow-up.', 'consistency')).toEqual(['consistency: followup -> follow-up']);
  });

  it('leaves different words and single spellings alone', () => {
    expect(found('I will re-sign the contract. I will not resign. The co-op is not a coop.', 'consistency')).toEqual([]);
    expect(found('Visit our website. Our website is new.', 'consistency')).toEqual([]);
  });
});

describe('englishGrammarFindings', () => {
  it('always reports offsets that match the original text', () => {
    const text = 'Its a test , i think. he don\'t know.Then a apple, however we left.. Send e-mail or email.';
    expect(offsetsValid(text)).toBe(true);
    expect(englishGrammarFindings(text).length).toBeGreaterThan(6);
  });

  it('stays fast on long documents', () => {
    const paragraph = 'The team reviewed the follow-up plan with care, and everyone agreed on the next steps. ';
    const text = paragraph.repeat(400); // ~35,000 characters
    const start = performance.now();
    englishGrammarFindings(text);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
