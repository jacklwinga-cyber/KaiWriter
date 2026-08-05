import { openDb } from './idb';

const STORE_NAME = 'comments';

export interface DocumentComment {
  id: string;
  documentId: string;
  authorName: string;
  body: string;
  resolved: boolean;
  createdAt: number;
}


export async function listComments(documentId: string): Promise<DocumentComment[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('documentId');
    const request = index.getAll(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const comments = (request.result as DocumentComment[]) ?? [];
      resolve(comments.sort((a, b) => b.createdAt - a.createdAt));
    };
  });
}

export async function addComment(
  documentId: string,
  authorName: string,
  body: string,
): Promise<DocumentComment> {
  const comment: DocumentComment = {
    id: crypto.randomUUID(),
    documentId,
    authorName,
    body: body.trim(),
    resolved: false,
    createdAt: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(comment);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return comment;
}

export async function updateComment(comment: DocumentComment): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(comment);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCommentsForDocument(documentId: string): Promise<void> {
  const comments = await listComments(documentId);
  if (comments.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const c of comments) store.delete(c.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceCommentsForDocument(
  documentId: string,
  comments: DocumentComment[],
): Promise<void> {
  await deleteCommentsForDocument(documentId);
  if (comments.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const c of comments) store.put(c);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
