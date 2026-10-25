/**
 * "Download my data" and "Delete my account".
 *
 * The export is built from what is on this device (which, for a synced
 * account, includes every cloud document), plus the account's AI usage when
 * signed in. Deleting an account removes all cloud data (the delete-account
 * edge function); clearing this device is a separate, explicit choice.
 */
import {
  CONFIRM_PHRASE,
  DELETE_ACCOUNT_MESSAGES,
  isDeleteAccountErrorCode,
  type DeleteAccountErrorCode,
} from '../../supabase/functions/_shared/accountCore';
import { listAllDocuments } from './documentStore';
import { listFolders } from './folderStore';
import { listVersions } from './versionStore';
import { loadEntries } from './personalDictionary';
import { extractTextFromLexicalJSON } from './searchStore';
import { openDb } from './idb';
import { getSupabase, isSupabaseConfigured } from './supabase';

export { CONFIRM_PHRASE };

export interface DataExport {
  format: 'kaiwriter-data-export';
  version: 1;
  exportedAt: string;
  account: { id: string | null; email: string | null };
  documents: Array<{
    id: string;
    name: string;
    lastModified: string;
    inTrash: boolean;
    folderId: string | null;
    pinned: boolean;
    /** The document as plain text. */
    text: string;
    /** The full document (Lexical editor state JSON), for re-importing. */
    content: string;
    versions: Array<{ createdAt: string; source: 'auto' | 'manual'; text: string }>;
  }>;
  folders: Array<{ id: string; name: string }>;
  personalDictionary: string[];
  /** Kept on this device only. */
  settings: Record<string, unknown>;
  /** AI requests per day (cloud accounts), or a note on why it's missing. */
  aiUsage: Array<{ day: string; requests: number; inputTokens: number; outputTokens: number }> | { unavailable: string };
}

/** Device-only settings worth including (no credentials, no PIN hash). */
const SETTINGS_KEYS = ['kaiwriter-editor-preferences', 'kaiwriter-history-retention', 'kaiwriter-proofread-online-consent'];

function readSettings(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SETTINGS_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw;
      }
    } catch {
      // storage unavailable
    }
  }
  return out;
}

async function readAiUsage(userId: string | null): Promise<DataExport['aiUsage']> {
  if (!userId) return { unavailable: 'Not signed in to a cloud account.' };
  if (!isSupabaseConfigured()) return { unavailable: 'Cloud is not configured on this deployment.' };
  try {
    const { data, error } = await getSupabase()
      .from('kaiwriter_ai_usage')
      .select('day, requests, input_tokens, output_tokens')
      .eq('user_id', userId)
      .order('day', { ascending: true });
    if (error) return { unavailable: 'Could not read AI usage from the cloud.' };
    return (data ?? []).map((row) => ({
      day: String(row.day),
      requests: Number(row.requests) || 0,
      inputTokens: Number(row.input_tokens) || 0,
      outputTokens: Number(row.output_tokens) || 0,
    }));
  } catch {
    return { unavailable: 'Could not reach the cloud.' };
  }
}

export async function buildDataExport(account: { id: string | null; email: string | null }): Promise<DataExport> {
  const [docs, folders] = await Promise.all([listAllDocuments(), listFolders()]);
  const documents: DataExport['documents'] = [];
  for (const doc of docs.sort((a, b) => b.lastModified - a.lastModified)) {
    const versions = await listVersions(doc.id);
    documents.push({
      id: doc.id,
      name: doc.name,
      lastModified: new Date(doc.lastModified).toISOString(),
      inTrash: Boolean(doc.deletedAt),
      folderId: doc.folderId ?? null,
      pinned: Boolean(doc.pinned),
      text: extractTextFromLexicalJSON(doc.content),
      content: doc.content,
      versions: versions.map((v) => ({
        createdAt: new Date(v.createdAt).toISOString(),
        source: v.source,
        text: extractTextFromLexicalJSON(v.content),
      })),
    });
  }
  return {
    format: 'kaiwriter-data-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account,
    documents,
    folders: folders.map((f) => ({ id: f.id, name: f.name })),
    personalDictionary: loadEntries(account.id).filter((e) => !e.deletedAt).map((e) => e.word).sort(),
    settings: readSettings(),
    aiUsage: await readAiUsage(account.id),
  };
}

/** Build the export and save it as a .json file. */
export async function downloadDataExport(account: { id: string | null; email: string | null }): Promise<number> {
  const data = await buildDataExport(account);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kaiwriter-data-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return data.documents.length;
}

export class DeleteAccountError extends Error {
  readonly code: DeleteAccountErrorCode | 'network';
  constructor(code: DeleteAccountError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'DeleteAccountError';
  }
}

/** Ask the server to delete the signed-in account. Throws DeleteAccountError. */
export async function requestAccountDeletion(
  accessToken: string,
  confirm: string,
  options: { supabaseUrl?: string; anonKey?: string } = {},
): Promise<void> {
  if (confirm !== CONFIRM_PHRASE) throw new DeleteAccountError('bad_request', DELETE_ACCOUNT_MESSAGES.bad_request);
  const supabaseUrl = options.supabaseUrl ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  if (!supabaseUrl) throw new DeleteAccountError('not_configured', DELETE_ACCOUNT_MESSAGES.not_configured);
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: options.anonKey ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string),
      },
      body: JSON.stringify({ confirm }),
    });
  } catch {
    throw new DeleteAccountError('network', 'Couldn’t reach the server (you may be offline). Nothing was deleted.');
  }
  let payload: { deleted?: unknown; error?: { code?: unknown } } = {};
  try {
    payload = await response.json();
  } catch {
    // handled below
  }
  if (response.ok && payload.deleted === true) return;
  const code = isDeleteAccountErrorCode(payload.error?.code) ? payload.error.code : 'failed';
  throw new DeleteAccountError(code, DELETE_ACCOUNT_MESSAGES[code]);
}

/**
 * Remove this account's data from this device: its sync queue, sync
 * positions and dictionary, and, if `documents` is true, every document,
 * folder, version and comment stored here (including any made before
 * signing in). Device settings such as the theme are kept.
 */
export async function clearLocalAccountData(userId: string, options: { documents: boolean }): Promise<void> {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kaiwriter-') && key.includes(userId)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // storage unavailable
  }
  if (!options.documents) return;
  const db = await openDb();
  const stores = ['documents', 'versions', 'comments', 'folders'].filter((name) => db.objectStoreNames.contains(name));
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const name of stores) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  try {
    localStorage.removeItem('kaiwriter-personal-dictionary:guest');
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('kaiwriter-recovery-') || key?.startsWith('kaiwriter-track-changes:')) localStorage.removeItem(key);
    }
  } catch {
    // storage unavailable
  }
}
