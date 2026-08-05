/** Stable unique id for new documents (avoids Date.now collisions). */
export function createDocumentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
