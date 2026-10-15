import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveDocument } from '../lib/documentStore';
import { createDocumentId } from '../lib/ids';

const ACCEPT = '.docx,.txt,.text,.md,.markdown,.html,.htm';

/**
 * File ▸ Open: pick a Word, text or HTML file, save it as a new document and
 * open it in the editor. Render `input` once; call `open()` from a button.
 * `beforeCreate` can veto (e.g. the free plan's document limit).
 */
export function useOpenDocumentFile(beforeCreate?: () => Promise<boolean>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (beforeCreate && !(await beforeCreate())) return;
    inputRef.current?.click();
  };

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    if (!file) return;
    setBusy(true);
    try {
      const { importDocumentFile } = await import('../lib/importDocument');
      const imported = await importDocumentFile(file);
      if (imported.warnings.length) console.info('[KaiWriter] import notes:', imported.warnings);
      const id = createDocumentId();
      await saveDocument({ id, name: imported.name, content: imported.content, lastModified: Date.now() });
      navigate(`/doc/${id}`);
    } catch (err) {
      const { UnsupportedFileError } = await import('../lib/importDocument');
      window.alert(err instanceof UnsupportedFileError ? err.message : `Couldn't open “${file.name}”. The file may be damaged or password-protected.`);
      if (!(err instanceof UnsupportedFileError)) console.error('[KaiWriter] import failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const input = (
    <input ref={inputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={(e) => void handleChange(e)} />
  );

  return { open, input, busy };
}
