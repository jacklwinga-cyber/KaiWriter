import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './MainLayout.module.css';
import { Settings, User, ChevronLeft, Undo, Redo, Printer, X, ChevronRight, Lock, History } from 'lucide-react';
import { SettingsModal, ProfileModal } from '../ui/Modals';
import { LegacyPinProBanner } from '../ui/LegacyPinProBanner';
import { useAuth } from '../../contexts/AuthProvider';
import { createDocumentId } from '../../lib/ids';
import type { SaveStatus, SyncStatus } from '../../contexts/EditorChromeContext';

const RIBBON_TABS = ['File', 'Home', 'Insert', 'Layout', 'Review', 'View'] as const;

interface MainLayoutProps {
  children: React.ReactNode;
  toolbar?: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  rightSidebar?: React.ReactNode;
  leftSidebar?: React.ReactNode;
  statusBar?: React.ReactNode;
  documentName?: string;
  onNameChange?: (name: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  saveStatus?: SaveStatus;
  syncStatus?: SyncStatus;
  isPro?: boolean;
  onExportDocx?: () => void;
  onExportTxt?: () => void;
  onExportPdf?: () => void;
  onRequestUpgrade?: () => void;
  onOpenVersionHistory?: () => void;
}

export function MainLayout({
  children,
  toolbar,
  activeTab = 'Home',
  onTabChange,
  rightSidebar,
  leftSidebar,
  statusBar,
  documentName = 'Untitled Document',
  onNameChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  saveStatus = 'saved',
  syncStatus = 'disabled' as SyncStatus,
  isPro = false,
  onExportDocx,
  onExportTxt,
  onExportPdf,
  onRequestUpgrade,
  onOpenVersionHistory,
}: MainLayoutProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileDefaultView, setProfileDefaultView] = useState<'main' | 'signin'>('main');
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const saveLabel =
    saveStatus === 'saving'   ? 'Saving…' :
    saveStatus === 'unsaved'  ? 'Unsaved' :
    saveStatus === 'error'    ? 'Save failed' :
    saveStatus === 'recovered' ? 'Recovered' :
    'Saved';

  const openAccount = (view: 'main' | 'signin' = 'main') => {
    setProfileDefaultView(view);
    setIsProfileOpen(true);
  };

  return (
    <div className={styles.appContainer}>
      <LegacyPinProBanner onSignIn={() => openAccount('signin')} />
      <div className={styles.titleBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className={styles.windowControls}>
            <div className={`${styles.windowControl} ${styles.close}`} />
            <div className={`${styles.windowControl} ${styles.minimize}`} />
            <div className={`${styles.windowControl} ${styles.maximize}`} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
            <Link to="/app" className={styles.iconButton} title="Back to Dashboard">
              <ChevronLeft size={16} />
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', gap: '4px' }}>
              <span>AutoSave</span>
              <div style={{ width: '24px', height: '14px', background: '#fff', borderRadius: '10px', position: 'relative' }}>
                <div style={{ width: '10px', height: '10px', background: 'var(--accent-gold-light)', borderRadius: '50%', position: 'absolute', right: '2px', top: '2px' }} />
              </div>
            </div>

            <button type="button" className={styles.iconButton} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{ opacity: canUndo ? 1 : 0.4 }}>
              <Undo size={20} />
            </button>
            <button type="button" className={styles.iconButton} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{ opacity: canRedo ? 1 : 0.4 }}>
              <Redo size={20} />
            </button>
          </div>
        </div>

        <div className={styles.title} style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <input
            type="text"
            value={documentName}
            onChange={(e) => onNameChange?.(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '14px', textAlign: 'center', outline: 'none', minWidth: '200px' }}
          />
          <span style={{
                fontSize: '11px',
                color: saveStatus === 'error' ? '#fca5a5' :
                       saveStatus === 'recovered' ? '#86efac' :
                       'rgba(255,255,255,0.7)',
              }}>• {saveLabel}</span>
          {syncStatus !== 'disabled' && (
            <span style={{
              fontSize: '11px',
              marginLeft: '6px',
              color: syncStatus === 'sync_failed' ? '#fca5a5' :
                     syncStatus === 'synced'      ? 'rgba(255,255,255,0.5)' :
                     syncStatus === 'syncing'     ? 'rgba(255,255,255,0.7)' :
                                                    'rgba(255,255,255,0.4)',
            }}>
              {syncStatus === 'syncing'     ? '↑ Syncing…' :
               syncStatus === 'synced'      ? '✓ Synced' :
               syncStatus === 'sync_failed' ? '⚠ Sync failed' :
               syncStatus === 'offline'     ? '⚡ Offline' : null}
            </span>
          )}
        </div>

        <div className={styles.titleActions} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="button" className={styles.iconButton} onClick={() => onExportPdf?.() ?? window.print()} title="Print / Export to PDF">
            <Printer size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => openAccount()}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={16} style={{ color: 'var(--brand-primary)' }} />
            </div>
            <span style={{ fontSize: '12px' }}>{user?.displayName ?? 'Guest'}</span>
          </div>
          <button type="button" className={styles.iconButton} onClick={() => setIsSettingsOpen(true)} title="Settings">
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className={styles.ribbonContainer}>
        <div className={styles.ribbonTabs}>
          {RIBBON_TABS.map((tab) => (
            <div key={tab} style={{ position: 'relative' }}>
              <button
                type="button"
                className={`${styles.tab} ${activeTab === tab && tab !== 'File' ? styles.tabActive : ''}`}
                style={tab === 'File' ? { backgroundColor: isFileMenuOpen ? 'var(--accent-light)' : 'transparent' } : {}}
                onClick={() => {
                  if (tab === 'File') setIsFileMenuOpen(!isFileMenuOpen);
                  else {
                    setIsFileMenuOpen(false);
                    onTabChange?.(tab);
                  }
                }}
              >
                {tab}
              </button>

              {tab === 'File' && isFileMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setIsFileMenuOpen(false)} />
                  <div className={styles.fileDropdown}>
                    <div className={styles.fileMenuItem} onClick={() => { setIsFileMenuOpen(false); navigate(`/doc/${createDocumentId()}`); }}>New Document</div>
                    <div className={styles.fileMenuItem} onClick={() => { setIsFileMenuOpen(false); navigate('/app'); }}>New from Template…</div>
                    <div className={styles.fileMenuItem} onClick={() => { setIsFileMenuOpen(false); navigate('/app'); }}>Open Recent…</div>
                    <div className={styles.fileMenuDivider} />
                    <div
                      className={styles.fileMenuItem}
                      onClick={() => {
                        setIsFileMenuOpen(false);
                        if (isPro) onOpenVersionHistory?.();
                        else onRequestUpgrade?.();
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <History size={14} /> Version History
                      {!isPro && <Lock size={12} style={{ marginLeft: 'auto', opacity: 0.7 }} />}
                    </div>
                    <div className={styles.fileMenuDivider} />
                    <div className={styles.fileMenuItem} onClick={() => { setIsFileMenuOpen(false); navigate('/app'); }}>
                      <X size={14} style={{ marginRight: '8px' }} /> Close
                    </div>
                    <div className={styles.fileMenuDivider} />
                    <div className={styles.fileMenuItem} onClick={() => { setIsFileMenuOpen(false); onExportPdf?.() ?? window.print(); }}>Export as PDF (Print)…</div>
                    <div
                      className={styles.fileMenuItem}
                      onMouseEnter={() => setShowExportMenu(true)}
                      onMouseLeave={() => setShowExportMenu(false)}
                      style={{ position: 'relative' }}
                    >
                      Export as… <ChevronRight size={14} style={{ marginLeft: 'auto' }} />
                      {showExportMenu && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: '100%',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            zIndex: 101,
                            minWidth: '200px',
                            boxShadow: 'var(--shadow-dropdown)',
                          }}
                          onMouseEnter={() => setShowExportMenu(true)}
                          onMouseLeave={() => setShowExportMenu(false)}
                        >
                          <div className={styles.fileMenuItem} onClick={() => { setIsFileMenuOpen(false); setShowExportMenu(false); onExportTxt?.(); }}>
                            Plain Text (.txt)
                          </div>
                          <div
                            className={styles.fileMenuItem}
                            onClick={() => {
                              setIsFileMenuOpen(false);
                              setShowExportMenu(false);
                              if (isPro) onExportDocx?.();
                              else onRequestUpgrade?.();
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                          >
                            Word Document (.docx)
                            {!isPro && <Lock size={12} style={{ marginLeft: 'auto', opacity: 0.7 }} />}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        {toolbar}
      </div>

      <div className={styles.workspace}>
        {leftSidebar}
        <div className={styles.editorScrollArea}>
          {children}
        </div>
        {rightSidebar}
      </div>

      {statusBar}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        defaultView={profileDefaultView}
      />
    </div>
  );
}
