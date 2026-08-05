import { useEffect, useState } from 'react';
import { MessageSquare, X, Check } from 'lucide-react';
import styles from '../../layout/MainLayout.module.css';
import {
  addComment,
  listComments,
  updateComment,
  type DocumentComment,
} from '../../../lib/commentStore';
import { useAuth } from '../../../contexts/AuthProvider';

interface CommentsSidebarPluginProps {
  documentId: string;
  onClose?: () => void;
  onCommentsChange?: () => void;
}

export function CommentsSidebarPlugin({
  documentId,
  onClose,
  onCommentsChange,
}: CommentsSidebarPluginProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setComments(await listComments(documentId));
    onCommentsChange?.();
  };

  useEffect(() => {
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [documentId]);

  const handleAdd = async () => {
    if (!draft.trim()) return;
    await addComment(documentId, user?.displayName ?? 'Guest', draft.trim());
    setDraft('');
    await refresh();
    if (user?.id) {
      void import('../../../lib/cloudSync').then((m) => m.syncCommentsToCloud(user.id, documentId));
    }
  };

  const toggleResolved = async (comment: DocumentComment) => {
    await updateComment({ ...comment, resolved: !comment.resolved });
    await refresh();
    if (user?.id) {
      void import('../../../lib/cloudSync').then((m) => m.syncCommentsToCloud(user.id, documentId));
    }
  };

  const openCount = comments.filter((c) => !c.resolved).length;

  return (
    <div className={styles.navigationPane}>
      <div className={styles.paneHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={16} />
          <span>Comments {openCount > 0 ? `(${openCount})` : ''}</span>
        </div>
        {onClose && (
          <button type="button" className={styles.paneCloseBtn} onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>

      <div style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          style={{
            width: '100%',
            resize: 'vertical',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          }}
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => void handleAdd()}
          style={{
            marginTop: '8px',
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            border: 'none',
            background: 'var(--brand-primary)',
            color: 'white',
            cursor: 'pointer',
            opacity: draft.trim() ? 1 : 0.5,
          }}
        >
          Add comment
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {loading && <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading…</p>}
        {!loading && comments.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            No comments yet. Use comments for review notes and feedback.
          </p>
        )}
        {comments.map((comment) => (
          <div
            key={comment.id}
            style={{
              padding: '10px',
              marginBottom: '8px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: comment.resolved ? 'var(--bg-hover)' : 'var(--bg-surface)',
              opacity: comment.resolved ? 0.7 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <strong style={{ fontSize: '12px' }}>{comment.authorName}</strong>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {new Date(comment.createdAt).toLocaleString()}
              </span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '13px', lineHeight: 1.4 }}>{comment.body}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => void toggleResolved(comment)}
                style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <Check size={12} /> {comment.resolved ? 'Reopen' : 'Resolve'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
