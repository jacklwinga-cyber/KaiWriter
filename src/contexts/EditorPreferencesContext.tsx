import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  clampZoom,
  getLocaleById,
  loadEditorPreferences,
  saveEditorPreferences,
  type EditorPreferences,
  type EditorViewMode,
} from '../lib/editorPreferences';

interface EditorPreferencesContextValue extends EditorPreferences {
  localeLabel: string;
  languageToolCode: string;
  setLocaleId: (id: string) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setViewMode: (mode: EditorViewMode) => void;
  setDetectLanguageAutomatically: (value: boolean) => void;
  setDisableSpellCheck: (value: boolean) => void;
}

const EditorPreferencesContext = createContext<EditorPreferencesContextValue | null>(null);

export function EditorPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<EditorPreferences>(() => loadEditorPreferences());

  const persist = useCallback((next: EditorPreferences) => {
    setPrefs(next);
    saveEditorPreferences(next);
  }, []);

  const setLocaleId = useCallback((localeId: string) => {
    persist({ ...prefs, localeId });
  }, [persist, prefs]);

  const setZoom = useCallback((zoom: number) => {
    persist({ ...prefs, zoom: clampZoom(zoom) });
  }, [persist, prefs]);

  const zoomIn = useCallback(() => {
    persist({ ...prefs, zoom: clampZoom(prefs.zoom + 10) });
  }, [persist, prefs]);

  const zoomOut = useCallback(() => {
    persist({ ...prefs, zoom: clampZoom(prefs.zoom - 10) });
  }, [persist, prefs]);

  const resetZoom = useCallback(() => {
    persist({ ...prefs, zoom: 100 });
  }, [persist, prefs]);

  const setViewMode = useCallback((viewMode: EditorViewMode) => {
    persist({ ...prefs, viewMode });
  }, [persist, prefs]);

  const setDetectLanguageAutomatically = useCallback((detectLanguageAutomatically: boolean) => {
    persist({ ...prefs, detectLanguageAutomatically });
  }, [persist, prefs]);

  const setDisableSpellCheck = useCallback((disableSpellCheck: boolean) => {
    persist({ ...prefs, disableSpellCheck });
  }, [persist, prefs]);

  const locale = getLocaleById(prefs.localeId);

  const value = useMemo(
    () => ({
      ...prefs,
      localeLabel: locale.label,
      languageToolCode: locale.languageTool,
      setLocaleId,
      setZoom,
      zoomIn,
      zoomOut,
      resetZoom,
      setViewMode,
      setDetectLanguageAutomatically,
      setDisableSpellCheck,
    }),
    [
      prefs,
      locale.label,
      locale.languageTool,
      setLocaleId,
      setZoom,
      zoomIn,
      zoomOut,
      resetZoom,
      setViewMode,
      setDetectLanguageAutomatically,
      setDisableSpellCheck,
    ],
  );

  return (
    <EditorPreferencesContext.Provider value={value}>
      {children}
    </EditorPreferencesContext.Provider>
  );
}

export function useEditorPreferences() {
  const ctx = useContext(EditorPreferencesContext);
  if (!ctx) throw new Error('useEditorPreferences must be used within EditorPreferencesProvider');
  return ctx;
}

export function useEditorPreferencesOptional() {
  return useContext(EditorPreferencesContext);
}
