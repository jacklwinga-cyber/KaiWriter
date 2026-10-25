/**
 * Offline UK/US English spelling consistency.
 *
 * Only unambiguous pairs are listed: words where one spelling is simply the
 * other variety's form. Pairs that depend on meaning (program/programme,
 * check/cheque, license/licence, practice/practise, meter/metre, tire/tyre)
 * and -ize/-ise (both are correct in UK Oxford spelling) are deliberately left out.
 */

export type EnglishVariant = 'en-GB' | 'en-US';

/** [US, UK] */
const PAIRS: Array<[string, string]> = [
  ['color', 'colour'], ['colors', 'colours'], ['colored', 'coloured'], ['colorful', 'colourful'], ['coloring', 'colouring'],
  ['favorite', 'favourite'], ['favorites', 'favourites'], ['favor', 'favour'], ['favors', 'favours'], ['favorable', 'favourable'],
  ['behavior', 'behaviour'], ['behaviors', 'behaviours'], ['behavioral', 'behavioural'],
  ['honor', 'honour'], ['honored', 'honoured'], ['labor', 'labour'], ['neighbor', 'neighbour'], ['neighbors', 'neighbours'],
  ['neighborhood', 'neighbourhood'], ['flavor', 'flavour'], ['flavors', 'flavours'], ['humor', 'humour'], ['rumor', 'rumour'],
  ['harbor', 'harbour'], ['endeavor', 'endeavour'], ['savior', 'saviour'], ['vapor', 'vapour'],
  ['center', 'centre'], ['centers', 'centres'], ['centered', 'centred'], ['theater', 'theatre'], ['theaters', 'theatres'],
  ['liter', 'litre'], ['liters', 'litres'], ['fiber', 'fibre'], ['caliber', 'calibre'], ['somber', 'sombre'],
  ['gray', 'grey'], ['analyze', 'analyse'], ['analyzed', 'analysed'], ['analyzing', 'analysing'], ['paralyze', 'paralyse'],
  ['catalog', 'catalogue'], ['catalogs', 'catalogues'], ['defense', 'defence'], ['offense', 'offence'], ['pretense', 'pretence'],
  ['traveled', 'travelled'], ['traveling', 'travelling'], ['traveler', 'traveller'], ['travelers', 'travellers'],
  ['canceled', 'cancelled'], ['canceling', 'cancelling'], ['modeling', 'modelling'], ['modeled', 'modelled'],
  ['labeled', 'labelled'], ['labeling', 'labelling'], ['fueled', 'fuelled'], ['fueling', 'fuelling'], ['counselor', 'counsellor'],
  ['jewelry', 'jewellery'], ['mold', 'mould'], ['plow', 'plough'], ['aluminum', 'aluminium'], ['cozy', 'cosy'],
  ['pajamas', 'pyjamas'], ['mustache', 'moustache'], ['maneuver', 'manoeuvre'], ['aging', 'ageing'],
  ['enrollment', 'enrolment'], ['fulfill', 'fulfil'], ['skillful', 'skilful'], ['willful', 'wilful'], ['installment', 'instalment'],
  ['artifact', 'artefact'], ['donut', 'doughnut'], ['estrogen', 'oestrogen'], ['esophagus', 'oesophagus'],
];

const US_TO_UK = new Map(PAIRS);
const UK_TO_US = new Map(PAIRS.map(([us, uk]) => [uk, us]));

export interface VariantMatch {
  offset: number;
  length: number;
  original: string;
  replacement: string;
}

/** Copy the capitalisation of `like` onto `word` (all caps, Capitalised or lower). */
function matchCase(word: string, like: string): string {
  if (like.length > 1 && like === like.toUpperCase()) return word.toUpperCase();
  if (like[0] === like[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/** Map a proofing locale to the spelling variety it uses, if it's one we check. */
export function englishVariantFor(languageCode: string | undefined): EnglishVariant | null {
  const code = (languageCode ?? '').toLowerCase();
  if (code === 'en-us') return 'en-US';
  if (code === 'en-gb' || code === 'en-au' || code === 'en-nz' || code === 'en-za' || code === 'en-ie') return 'en-GB';
  return null; // en-CA mixes conventions; other languages aren't English
}

/** Words spelled the other variety's way. */
export function findVariantSpellings(text: string, variant: EnglishVariant): VariantMatch[] {
  const lookup = variant === 'en-GB' ? US_TO_UK : UK_TO_US;
  const matches: VariantMatch[] = [];
  for (const match of text.matchAll(/[A-Za-z]+/g)) {
    const word = match[0];
    const replacement = lookup.get(word.toLowerCase());
    if (!replacement) continue;
    matches.push({ offset: match.index ?? 0, length: word.length, original: word, replacement: matchCase(replacement, word) });
  }
  return matches;
}
