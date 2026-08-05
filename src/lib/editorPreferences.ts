export type EditorViewMode = 'print' | 'web' | 'read';

export interface ProofingLocale {
  id: string;
  label: string;
  languageTool: string;
}

export const PROOFING_LOCALES: ProofingLocale[] = [
  { id: 'en-US', label: 'English (United States)', languageTool: 'en-US' },
  { id: 'en-GB', label: 'English (United Kingdom)', languageTool: 'en-GB' },
  { id: 'en-AU', label: 'English (Australia)', languageTool: 'en-AU' },
  { id: 'en-CA', label: 'English (Canada)', languageTool: 'en-CA' },
  { id: 'en-ZA', label: 'English (South Africa)', languageTool: 'en-GB' },
  { id: 'fr-FR', label: 'French (France)', languageTool: 'fr' },
  { id: 'de-DE', label: 'German (Germany)', languageTool: 'de-DE' },
  { id: 'es-ES', label: 'Spanish (Spain)', languageTool: 'es' },
  { id: 'pt-BR', label: 'Portuguese (Brazil)', languageTool: 'pt-BR' },
  { id: 'it-IT', label: 'Italian (Italy)', languageTool: 'it' },
  { id: 'nl-NL', label: 'Dutch (Netherlands)', languageTool: 'nl' },
  { id: 'sv-SE', label: 'Swedish (Sweden)', languageTool: 'sv' },
  { id: 'da-DK', label: 'Danish (Denmark)', languageTool: 'da-DK' },
  { id: 'nb-NO', label: 'Norwegian (Bokmål)', languageTool: 'nb' },
  { id: 'pl-PL', label: 'Polish (Poland)', languageTool: 'pl-PL' },
  { id: 'ar', label: 'Arabic', languageTool: 'ar' },
];

const STORAGE_KEY = 'kaiwriter-editor-preferences';

export interface EditorPreferences {
  localeId: string;
  zoom: number;
  viewMode: EditorViewMode;
  detectLanguageAutomatically: boolean;
  disableSpellCheck: boolean;
}

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  localeId: 'en-US',
  zoom: 100,
  viewMode: 'print',
  detectLanguageAutomatically: true,
  disableSpellCheck: false,
};

export function loadEditorPreferences(): EditorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_EDITOR_PREFERENCES;
    return { ...DEFAULT_EDITOR_PREFERENCES, ...(JSON.parse(raw) as Partial<EditorPreferences>) };
  } catch {
    return DEFAULT_EDITOR_PREFERENCES;
  }
}

export function saveEditorPreferences(prefs: EditorPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function getLocaleById(id: string): ProofingLocale {
  return PROOFING_LOCALES.find((l) => l.id === id) ?? PROOFING_LOCALES[0];
}

export function clampZoom(value: number): number {
  return Math.min(200, Math.max(50, Math.round(value)));
}
