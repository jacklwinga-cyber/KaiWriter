import { getSupabase, isSupabaseConfigured } from './supabase';
import { listDocuments, saveDocumentLocal, type StoredDocument } from './documentStore';
import { listComments, replaceCommentsForDocument, type DocumentComment } from './commentStore';
import type { DocumentBranding } from './branding';

function rowToDoc(row: {
  id: string;
  name: string;
  content: string;
  template_id: string | null;
  last_modified: number;
  branding?: DocumentBranding | null;
}): StoredDocument {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    templateId: row.template_id ?? undefined,
    lastModified: row.last_modified,
    branding: row.branding ?? undefined,
  };
}

export async function pushDocumentToCloud(userId: string, doc: StoredDocument): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabase();
  const { error } = await supabase.from('kaiwriter_documents').upsert({
    id: doc.id,
    user_id: userId,
    name: doc.name,
    content: doc.content,
    template_id: doc.templateId ?? null,
    last_modified: doc.lastModified,
    branding: doc.branding ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error('Cloud sync push failed:', error.message);
}

export async function deleteDocumentFromCloud(userId: string, docId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from('kaiwriter_documents')
    .delete()
    .eq('user_id', userId)
    .eq('id', docId);
  if (error) console.error('Cloud delete failed:', error.message);
}

export async function fetchCloudDocuments(userId: string): Promise<StoredDocument[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kaiwriter_documents')
    .select('id, name, content, template_id, last_modified, branding')
    .eq('user_id', userId)
    .order('last_modified', { ascending: false });
  if (error) {
    console.error('Cloud fetch failed:', error.message);
    return [];
  }
  return (data ?? []).map(rowToDoc);
}

/** Merge cloud documents into local IndexedDB (newer lastModified wins). */
export async function mergeCloudIntoLocal(userId: string): Promise<void> {
  const [cloudDocs, localDocs] = await Promise.all([
    fetchCloudDocuments(userId),
    listDocuments(),
  ]);

  const localById = new Map(localDocs.map((d) => [d.id, d]));

  for (const cloudDoc of cloudDocs) {
    const local = localById.get(cloudDoc.id);
    if (!local || cloudDoc.lastModified > local.lastModified) {
      await saveDocumentLocal(cloudDoc);
    } else if (local.lastModified > cloudDoc.lastModified) {
      await pushDocumentToCloud(userId, local);
    }
  }

  // Push local-only documents to cloud
  for (const localDoc of localDocs) {
    if (!cloudDocs.some((c) => c.id === localDoc.id)) {
      await pushDocumentToCloud(userId, localDoc);
    }
  }
}

export interface SubscriptionDetails {
  plan: 'free' | 'pro' | 'teams';
  status: string;
  currentPeriodEnd: number | null;
}

export async function fetchSubscriptionDetails(userId: string): Promise<SubscriptionDetails> {
  if (!isSupabaseConfigured()) {
    return { plan: 'free', status: 'inactive', currentPeriodEnd: null };
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kaiwriter_subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    return { plan: 'free', status: 'inactive', currentPeriodEnd: null };
  }
  const periodEnd = data.current_period_end
    ? new Date(data.current_period_end).getTime()
    : null;
  const isPaid = data.status === 'active' || data.status === 'trialing';
  return {
    plan: isPaid ? (data.plan as 'free' | 'pro' | 'teams') : 'free',
    status: data.status,
    currentPeriodEnd: periodEnd,
  };
}

export async function fetchSubscriptionPlan(userId: string): Promise<'free' | 'pro' | 'teams'> {
  const details = await fetchSubscriptionDetails(userId);
  return details.plan;
}

function rowToComment(row: {
  id: string;
  document_id: string;
  author_name: string;
  body: string;
  resolved: boolean;
  created_at: string;
}): DocumentComment {
  return {
    id: row.id,
    documentId: row.document_id,
    authorName: row.author_name,
    body: row.body,
    resolved: row.resolved,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function fetchCloudComments(userId: string, documentId: string): Promise<DocumentComment[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kaiwriter_comments')
    .select('id, document_id, author_name, body, resolved, created_at')
    .eq('user_id', userId)
    .eq('document_id', documentId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Cloud comments fetch failed:', error.message);
    return [];
  }
  return (data ?? []).map(rowToComment);
}

export async function syncCommentsToCloud(userId: string, documentId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabase();
  const local = await listComments(documentId);

  const { error: deleteError } = await supabase
    .from('kaiwriter_comments')
    .delete()
    .eq('user_id', userId)
    .eq('document_id', documentId);
  if (deleteError) {
    console.error('Cloud comments delete failed:', deleteError.message);
    return;
  }

  if (local.length === 0) return;

  const { error } = await supabase.from('kaiwriter_comments').insert(
    local.map((c) => ({
      id: c.id,
      user_id: userId,
      document_id: c.documentId,
      author_name: c.authorName,
      body: c.body,
      resolved: c.resolved,
      created_at: new Date(c.createdAt).toISOString(),
    })),
  );
  if (error) console.error('Cloud comments push failed:', error.message);
}

export async function mergeCommentsFromCloud(userId: string, documentId: string): Promise<void> {
  const [cloud, local] = await Promise.all([
    fetchCloudComments(userId, documentId),
    listComments(documentId),
  ]);
  if (cloud.length === 0 && local.length === 0) return;
  if (cloud.length === 0) {
    await syncCommentsToCloud(userId, documentId);
    return;
  }
  if (local.length === 0) {
    await replaceCommentsForDocument(documentId, cloud);
    return;
  }
  const merged = new Map<string, DocumentComment>();
  for (const c of [...cloud, ...local]) merged.set(c.id, c);
  const result = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
  await replaceCommentsForDocument(documentId, result);
  await syncCommentsToCloud(userId, documentId);
}
