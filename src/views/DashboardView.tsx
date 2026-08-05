import { Link, useNavigate } from 'react-router-dom';
import {
  FileText, Plus, Search, Settings, User, Sparkles, Trash2, Pin, Lock, Pencil, LayoutGrid, FolderPlus, Folder, FolderOpen, Check,
  Briefcase, GraduationCap, Building2, Home, Clock, FilePlus,
  Calculator, Shield, Megaphone, Palette, ClipboardList,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './DashboardView.module.css';
import { SettingsModal, ProfileModal, ProUpgradeModal } from '../components/ui/Modals';
import { LegacyPinProBanner } from '../components/ui/LegacyPinProBanner';
import { hasSampleContent } from '../data/templateSamples';
import {
  DOCUMENT_TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATE_PACKS, TEMPLATE_COUNT, PREMIUM_TEMPLATE_COUNT, getTemplatesForPack,
  type DocumentTemplate,
} from '../data/templates';
import { TemplateThumbnail } from '../components/templates/TemplateThumbnail';
import { TemplateDetailPanel } from '../components/templates/TemplateDetailPanel';
import { TemplatePreviewModal } from '../components/templates/TemplatePreviewModal';
import { countDocuments, trashDocument, listDocuments, listTrashedDocuments, permanentlyDeleteDocument, restoreDocument, migrateFromLocalStorage, saveDocument, toggleDocumentPin, updateDocumentName, type StoredDocument } from '../lib/documentStore';
import { createDocumentId } from '../lib/ids';
import {
  createFolder,
  listFolders,
  renameFolder,
  deleteFolder,
  moveDocumentToFolder,
  listDocumentsInFolder,
  countDocumentsPerFolder,
  type StoredFolder,
} from '../lib/folderStore';
import { TemplateWizardModal } from '../components/templates/TemplateWizardModal';
import { FREE_DOCUMENT_LIMIT } from '../lib/stripe';
import { getKaiHubOrigin } from '../lib/site';
import { useAuth } from '../contexts/AuthProvider';
import { SearchPalette, useSearchPalette } from '../components/ui/SearchPalette';

type DashboardView = 'home' | 'new' | 'recents' | 'trash' | 'folder';

function getInitials(name?: string | null): string {
  if (!name?.trim()) return 'KW';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function DashboardView() {
  const navigate = useNavigate();
  const { user, isPro, isCloudAccount } = useAuth();
  const [isSearchOpen, openSearch, closeSearch] = useSearchPalette();
  const [recentDocs, setRecentDocs] = useState<StoredDocument[]>([]);
  const [trashedDocs, setTrashedDocs] = useState<StoredDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>('new');
  // ── Folder state ──
  const [folders, setFolders] = useState<StoredFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderDocCounts, setFolderDocCounts] = useState<Map<string, number>>(new Map());
  const [folderDocs, setFolderDocs] = useState<StoredDocument[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const [folderMenuDocId, setFolderMenuDocId] = useState<string | null>(null);

  // Close folder picker on any outside click or Escape
  useEffect(() => {
    if (!folderMenuDocId) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if ((e as KeyboardEvent).key === 'Escape' || e.type === 'mousedown') {
        setFolderMenuDocId(null);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [folderMenuDocId]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('blank');
  const [populateSample, setPopulateSample] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileDefaultView, setProfileDefaultView] = useState<'main' | 'signin'>('main');
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [wizardTemplate, setWizardTemplate] = useState<DocumentTemplate | null>(null);
  const [previewModalTemplate, setPreviewModalTemplate] = useState<DocumentTemplate | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<string | undefined>();
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingDocId) renameInputRef.current?.focus();
  }, [renamingDocId]);

  useEffect(() => {
    (async () => {
      await migrateFromLocalStorage();
      const [active, trashed, allFolders, counts] = await Promise.all([
        listDocuments(),
        listTrashedDocuments(),
        listFolders(),
        countDocumentsPerFolder(),
      ]);
      setFolders(allFolders);
      setFolderDocCounts(counts);
      setRecentDocs(active);
      setTrashedDocs(trashed);
    })();
  }, []);

  const openAccount = (view: 'main' | 'signin' = 'main') => {
    setProfileDefaultView(view);
    setIsProfileOpen(true);
  };

  const openUpgrade = (reason?: string) => {
    setUpgradeReason(reason);
    setIsUpgradeOpen(true);
  };

  const ensureCanCreateDoc = async (): Promise<boolean> => {
    if (isPro) return true;
    const count = await countDocuments();
    if (count >= FREE_DOCUMENT_LIMIT) {
      openUpgrade(`You've reached the ${FREE_DOCUMENT_LIMIT}-document limit on the Free plan. Upgrade for unlimited documents.`);
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!(await ensureCanCreateDoc())) return;
    if (selectedTemplate?.premium && !isPro) {
      openUpgrade(`"${selectedTemplate.name}" is a Pro template. Start your 14-day free trial to unlock it and ${PREMIUM_TEMPLATE_COUNT - 1} more flagship templates.`);
      return;
    }
    if (selectedTemplateId === 'blank') {
      navigate(`/doc/${createDocumentId()}`);
      return;
    }
    if (populateSample) {
      const params = new URLSearchParams({ template: selectedTemplateId, populate: 'sample' });
      navigate(`/doc/${createDocumentId()}?${params.toString()}`);
      return;
    }
    if (selectedTemplate) {
      setWizardTemplate(selectedTemplate);
      return;
    }
    navigate(`/doc/${createDocumentId()}`);
  };

  const handleWizardSkip = () => {
    if (!wizardTemplate) return;
    const params = new URLSearchParams({ template: wizardTemplate.id });
    navigate(`/doc/${createDocumentId()}?${params.toString()}`);
    setWizardTemplate(null);
  };

  const handleWizardComplete = async (content: string, documentName: string) => {
    if (!wizardTemplate) return;
    const docId = createDocumentId();
    await saveDocument({
      id: docId,
      name: documentName,
      lastModified: Date.now(),
      content,
      templateId: wizardTemplate.id,
    });
    setWizardTemplate(null);
    navigate(`/doc/${docId}?template=${wizardTemplate.id}`);
  };

  const filteredTemplates = useMemo(() => {
    if (activePackId) return getTemplatesForPack(activePackId);
    return DOCUMENT_TEMPLATES.filter((t) => {
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [activePackId, categoryFilter, searchQuery]);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.toLowerCase();
    if (!q) return recentDocs;
    return recentDocs.filter((d) => d.name.toLowerCase().includes(q));
  }, [recentDocs, searchQuery]);

  const selectPack = (packId: string, category: string) => {
    setActivePackId(packId);
    setCategoryFilter(category);
    setActiveView('new');
  };

  const packIcon = (category: string) => {
    if (category === 'business') return Building2;
    if (category === 'academic') return GraduationCap;
    if (category === 'finance') return Calculator;
    if (category === 'legal') return Shield;
    if (category === 'marketing') return Megaphone;
    if (category === 'creative') return Palette;
    if (category === 'productivity') return ClipboardList;
    return Briefcase;
  };

  const selectedTemplate = selectedTemplateId !== 'blank'
    ? DOCUMENT_TEMPLATES.find((t) => t.id === selectedTemplateId)
    : undefined;

  const refreshDocs = async () => {
    const [active, trashed] = await Promise.all([listDocuments(), listTrashedDocuments()]);
    setRecentDocs(active);
    setTrashedDocs(trashed);
  };

  const handleDelete = async (e: React.MouseEvent, docId: string, docName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Move "${docName}" to Trash?`)) return;
    await trashDocument(docId);
    await refreshDocs();
  };

  const handlePermanentDelete = async (docId: string, docName: string) => {
    if (!window.confirm(`Permanently delete "${docName}"? This cannot be undone.`)) return;
    await permanentlyDeleteDocument(docId);
    await refreshDocs();
  };

  const handleRestore = async (docId: string) => {
    await restoreDocument(docId);
    await refreshDocs();
  };

  const handleTogglePin = async (e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    e.stopPropagation();
    await toggleDocumentPin(docId);
    await refreshDocs();
  };

  const handleStartRename = (e: React.MouseEvent, doc: StoredDocument) => {
    e.preventDefault();
    e.stopPropagation();
    setRenamingDocId(doc.id);
    setRenameValue(doc.name);
  };

  const handleCommitRename = async (docId: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) await updateDocumentName(docId, trimmed);
    setRenamingDocId(null);
    await refreshDocs();
  };

  const handleCancelRename = () => {
    setRenamingDocId(null);
    setRenameValue('');
  };

  const selectTemplate = (id: string) => {
    setSelectedTemplateId(id);
    if (id === 'blank') setPopulateSample(false);
  };

  const showPopulateOption = selectedTemplateId !== 'blank' && hasSampleContent(selectedTemplateId);

  const docCountLabel = !isPro ? `${recentDocs.length}/${FREE_DOCUMENT_LIMIT} documents` : null;

  const renderTemplateCard = (id: string, name: string, template?: DocumentTemplate, isBlank = false) => {
    const isLocked = Boolean(template?.premium && !isPro);
    const hasSample = template ? hasSampleContent(template.id) : false;

    return (
    <button
      type="button"
      key={id}
      className={`${styles.templateCard} ${selectedTemplateId === id ? styles.templateCardSelected : ''} ${isLocked ? styles.templateCardLocked : ''}`}
      onClick={() => selectTemplate(id)}
      onDoubleClick={() => {
        selectTemplate(id);
        if (!isLocked) void handleCreate();
      }}
    >
      <div className={`${styles.templatePreview} ${isBlank ? styles.blankPreview : ''}`}>
        {isBlank ? (
          <div className={styles.blankPage}>
            <Plus size={28} className={styles.blankIcon} />
            <div className={styles.blankLines}>
              <span /><span /><span />
            </div>
          </div>
        ) : (
          <TemplateThumbnail templateId={id} category={template?.category} previewImage={template?.previewImage} />
        )}
        {template?.premium && <span className={styles.premiumBadge}>Pro</span>}
        {hasSample && <span className={styles.sampleBadge}>Sample</span>}
        {isLocked && (
          <div className={styles.premiumLock} aria-hidden>
            <Lock size={18} />
          </div>
        )}
      </div>
      <span className={styles.templateName}>{name}</span>
      {template?.description && (
        <span className={styles.templateDesc}>{template.description}</span>
      )}
      {template?.features && selectedTemplateId === id && (
        <span className={styles.templateFeatures}>{template.features.slice(0, 2).join(' · ')}</span>
      )}
    </button>
    );
  };

  // ── Folder helpers ──
  const refreshFolders = async () => {
    const [allFolders, counts] = await Promise.all([listFolders(), countDocumentsPerFolder()]);
    setFolders(allFolders);
    setFolderDocCounts(counts);
  };

  const refreshFolderDocs = async (folderId: string | null) => {
    const docs = await listDocumentsInFolder(folderId);
    setFolderDocs(docs);
  };

  const handleOpenFolder = async (folder: StoredFolder) => {
    setActiveFolderId(folder.id);
    setActiveView('folder');
    await refreshFolderDocs(folder.id);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) { setIsCreatingFolder(false); return; }
    await createFolder(newFolderName.trim());
    setNewFolderName('');
    setIsCreatingFolder(false);
    await refreshFolders();
  };

  const handleRenameFolder = async (id: string) => {
    if (renamingValue.trim()) await renameFolder(id, renamingValue.trim());
    setRenamingFolderId(null);
    await refreshFolders();
  };

  const handleDeleteFolder = async (id: string) => {
    const folder = folders.find((f) => f.id === id);
    const count = folderDocCounts.get(id) ?? 0;
    const msg = count > 0
      ? `Delete folder "${folder?.name}"? The ${count} document${count === 1 ? '' : 's'} inside will be moved to All Documents.`
      : `Delete folder "${folder?.name}"?`;
    if (!window.confirm(msg)) return;
    await deleteFolder(id);
    if (activeFolderId === id) { setActiveView('recents'); setActiveFolderId(null); }
    await refreshFolders();
    const [active, trashed2] = await Promise.all([listDocuments(), listTrashedDocuments()]);
    setRecentDocs(active);
    setTrashedDocs(trashed2);
  };

  const handleMoveDocToFolder = async (docId: string, folderId: string | null) => {
    await moveDocumentToFolder(docId, folderId);
    await refreshFolders();
    if (activeView === 'folder' && activeFolderId) await refreshFolderDocs(activeFolderId);
    const active = await listDocuments();
    setRecentDocs(active);
  };

  const viewTitles: Record<DashboardView, { title: string; subtitle: string }> = {
    home: { title: 'Welcome back', subtitle: 'Pick an industry pack to browse templates by category, or jump straight into a new document.' },
    new: {
      title: activePackId
        ? (TEMPLATE_PACKS.find((p) => p.id === activePackId)?.name ?? 'Start a new document')
        : 'Start a new document',
      subtitle: `${TEMPLATE_COUNT} templates — hover to read what each includes. Click to select, then hit Create or double-click to open immediately.`,
    },
    recents: { title: 'Recent documents', subtitle: 'Pick up where you left off. Hover a card to rename, pin, or delete.' },
    trash: { title: 'Trash', subtitle: trashedDocs.length > 0 ? `${trashedDocs.length} document${trashedDocs.length === 1 ? '' : 's'} — restore to recover, or permanently delete.` : 'Trash is empty.' },
    folder: {
      title: folders.find((f) => f.id === activeFolderId)?.name ?? 'Folder',
      subtitle: `${folderDocCounts.get(activeFolderId ?? '') ?? 0} document${(folderDocCounts.get(activeFolderId ?? '') ?? 0) === 1 ? '' : 's'} in this folder.`,
    },
  };

  const { title, subtitle } = viewTitles[activeView];

  return (
    <div className={styles.galleryShell}>
      <aside className={styles.iconSidebar}>
        <div className={styles.userBlock}>
          <div className={styles.avatar} title={user?.displayName ?? 'Guest'}>
            {getInitials(user?.displayName)}
          </div>
          <span className={styles.userName}>{user?.displayName?.split(' ')[0] ?? 'Guest'}</span>
        </div>

        <nav className={styles.sidebarNav}>
          <button
            type="button"
            className={`${styles.sidebarBtn} ${activeView === 'home' ? styles.sidebarBtnActive : ''}`}
            onClick={() => setActiveView('home')}
          >
            <Home size={22} />
            Home
          </button>
          <button
            type="button"
            className={`${styles.sidebarBtn} ${activeView === 'new' ? styles.sidebarBtnActive : ''}`}
            onClick={() => setActiveView('new')}
          >
            <FilePlus size={22} />
            New
          </button>
          <button
            type="button"
            className={`${styles.sidebarBtn} ${activeView === 'recents' ? styles.sidebarBtnActive : ''}`}
            onClick={() => setActiveView('recents')}
          >
            <Clock size={22} />
            Recents
          </button>
          <button
            type="button"
            className={`${styles.sidebarBtn} ${activeView === 'trash' ? styles.sidebarBtnActive : ''}`}
            onClick={() => setActiveView('trash')}
          >
            <Trash2 size={22} />
            Trash
            {trashedDocs.length > 0 && <span className={styles.trashCount}>{trashedDocs.length}</span>}
          </button>
        </nav>

        {/* ── Folders section ── */}
        <div className={styles.folderSection}>
          <div className={styles.folderSectionHeader}>
            <span>Folders</span>
            <button
              type="button"
              className={styles.addFolderBtn}
              title="New folder"
              onClick={() => {
                setIsCreatingFolder(true);
                setTimeout(() => newFolderInputRef.current?.focus(), 30);
              }}
            >
              <FolderPlus size={13} />
            </button>
          </div>

          {isCreatingFolder && (
            <div className={styles.newFolderRow}>
              <input
                ref={newFolderInputRef}
                className={styles.newFolderInput}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { void handleCreateFolder(); }
                  if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                }}
                onBlur={() => { void handleCreateFolder(); }}
              />
            </div>
          )}

          <div className={styles.folderList}>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`${styles.folderItem} ${activeView === 'folder' && activeFolderId === folder.id ? styles.folderItemActive : ''}`}
                onClick={() => { if (renamingFolderId !== folder.id) void handleOpenFolder(folder); }}
              >
                {renamingFolderId === folder.id ? (
                  <input
                    className={styles.folderRenameInput}
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { void handleRenameFolder(folder.id); }
                      if (e.key === 'Escape') setRenamingFolderId(null);
                    }}
                    onBlur={() => { void handleRenameFolder(folder.id); }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    {activeView === 'folder' && activeFolderId === folder.id
                      ? <FolderOpen size={18} />
                      : <Folder size={18} />
                    }
                    <span className={styles.folderItemName}>{folder.name}</span>
                    {(folderDocCounts.get(folder.id) ?? 0) > 0 && (
                      <span className={styles.folderItemCount}>
                        {folderDocCounts.get(folder.id)}
                      </span>
                    )}
                    <div className={styles.folderActions}>
                      <button
                        type="button"
                        className={styles.folderActionBtn}
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingFolderId(folder.id);
                          setRenamingValue(folder.name);
                        }}
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        type="button"
                        className={styles.folderActionBtn}
                        title="Delete folder"
                        onClick={(e) => { e.stopPropagation(); void handleDeleteFolder(folder.id); }}
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sidebarBottom}>
          {!isPro && (
            <button
              type="button"
              className={`${styles.sidebarBtn} ${styles.upgradeSidebar}`}
              onClick={() => openUpgrade()}
              title="Upgrade to Pro"
            >
              <Sparkles size={20} />
              Pro
            </button>
          )}
          <button type="button" className={styles.sidebarBtn} onClick={() => openAccount()} title="Account">
            <User size={20} />
            Account
          </button>
          <button type="button" className={styles.sidebarBtn} onClick={() => setIsSettingsOpen(true)} title="Settings">
            <Settings size={20} />
          </button>
          <a href={getKaiHubOrigin()} className={styles.sidebarBtn} title="KaiHub — all apps">
            <LayoutGrid size={20} />
            KaiHub
          </a>
        </div>
      </aside>

      <div className={styles.mainColumn}>
        <header className={styles.topBar}>
          <span className={styles.appTitle}>KaiWriter</span>
          <div className={styles.searchWrap}>
            <div className={styles.searchBar} onClick={openSearch} style={{ cursor: 'pointer' }} title="Search documents (⌘K)">
              <Search size={16} className={styles.searchIcon} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search documents… (⌘K)"
                readOnly
                onClick={openSearch}
                className={styles.searchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {!isPro && (
              <button type="button" className={styles.upgradeBtn} onClick={() => openUpgrade()}>
                <Sparkles size={14} /> Pro
              </button>
            )}
          </div>
        </header>

        {!user && (
          <div className={styles.guestBanner}>
            <span>Guest mode — documents stay on this device.</span>
            <button type="button" className={styles.guestBannerBtn} onClick={() => openAccount('signin')}>
              Sign in for cloud sync
            </button>
          </div>
        )}
        {!isCloudAccount && user && !isPro && (
          <div className={styles.guestBanner}>
            <span>Signed in locally with PIN — Pro and cloud sync need a cloud account.</span>
            <button type="button" className={styles.guestBannerBtn} onClick={() => openAccount('signin')}>
              Sign in with Google or email
            </button>
          </div>
        )}

        <LegacyPinProBanner onSignIn={() => openAccount('signin')} />

        <div className={styles.scrollArea}>
          <h1 className={styles.viewTitle}>{title}</h1>
          <p className={styles.viewSubtitle}>
            {subtitle}
            {docCountLabel && activeView === 'new' && ` · ${docCountLabel} on Free plan`}
          </p>

          {activeView === 'home' && !searchQuery && (
            <div className={styles.packGrid}>
              {TEMPLATE_PACKS.map((pack) => {
                const PackIcon = packIcon(pack.category);
                return (
                  <button
                    type="button"
                    key={pack.id}
                    className={styles.packCard}
                    onClick={() => selectPack(pack.id, pack.category)}
                  >
                    <PackIcon size={28} className={styles.packIcon} />
                    <span className={styles.packName}>{pack.name}</span>
                    <span className={styles.packDesc}>{pack.description}</span>
                    <span className={styles.packCount}>{pack.templateIds.length} templates</span>
                  </button>
                );
              })}
            </div>
          )}

          {activeView === 'new' && (
            <div className={styles.newDocLayout}>
              <div className={styles.templatePickerColumn}>
                <div className={styles.filterRow}>
                  {activePackId && (
                    <button type="button" className={styles.filterBtn} onClick={() => { setActivePackId(null); setCategoryFilter('all'); }}>
                      ← All packs
                    </button>
                  )}
                  <button
                    type="button"
                    className={categoryFilter === 'all' && !activePackId ? styles.filterActive : styles.filterBtn}
                    onClick={() => { setCategoryFilter('all'); setActivePackId(null); }}
                  >
                    All
                  </button>
                  {TEMPLATE_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={categoryFilter === c.id ? styles.filterActive : styles.filterBtn}
                      onClick={() => { setCategoryFilter(c.id); setActivePackId(null); }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <div className={styles.templateGrid}>
                  {renderTemplateCard('blank', 'Blank Document', undefined, true)}
                  {filteredTemplates.map((template: DocumentTemplate) =>
                    renderTemplateCard(template.id, template.name, template),
                  )}
                </div>
              </div>

              {selectedTemplate && (
                <TemplateDetailPanel
                  template={selectedTemplate}
                  isPro={isPro}
                  onPreviewFullscreen={() => setPreviewModalTemplate(selectedTemplate)}
                  onUpgrade={() => openUpgrade(`Unlock "${selectedTemplate.name}" and all Pro templates.`)}
                />
              )}
            </div>
          )}

          {activeView === 'recents' && (
            <>
              {filteredDocs.length === 0 ? (
                <p className={styles.emptyState}>
                  {searchQuery ? 'No documents match your search.' : 'No recent documents yet. Create one from the New tab.'}
                </p>
              ) : (
                <div className={styles.recentsGrid}>
                  {filteredDocs.map((doc) => (
                    <div key={doc.id} className={styles.recentCard} style={{ position: 'relative' }}>
                      <Link to={`/doc/${doc.id}`} className={styles.recentCardLink}>
                        <div className={styles.recentPreview}>
                          <div className={styles.recentPreviewLine} style={{ width: '70%' }} />
                          <div className={styles.recentPreviewLine} />
                          <div className={styles.recentPreviewLine} style={{ width: '85%' }} />
                          <div className={styles.recentPreviewLine} style={{ width: '55%' }} />
                          <div className={styles.recentActions}>
                            <button
                              type="button"
                              className={styles.recentActionBtn}
                              title="Rename"
                              onClick={(e) => handleStartRename(e, doc)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              className={styles.recentActionBtn}
                              title={doc.pinned ? 'Unpin' : 'Pin'}
                              onClick={(e) => void handleTogglePin(e, doc.id)}
                            >
                              <Pin size={13} fill={doc.pinned ? 'currentColor' : 'none'} />
                            </button>
                            <button
                              type="button"
                              className={styles.recentActionBtn}
                              title="Delete"
                              onClick={(e) => void handleDelete(e, doc.id, doc.name)}
                            >
                              <Trash2 size={13} />
                            </button>
                            {folders.length > 0 && (
                              <button
                                type="button"
                                className={styles.recentActionBtn}
                                title="Move to folder"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setFolderMenuDocId((prev) => (prev === doc.id ? null : doc.id));
                                }}
                              >
                                <Folder size={13} />
                              </button>
                            )}
                          </div>
                          {/* Folder picker popover */}
                          {folderMenuDocId === doc.id && (
                            <div
                              style={{
                                position: 'absolute',
                                bottom: '100%',
                                right: 0,
                                zIndex: 200,
                                background: 'var(--bg-surface, #2c2c2e)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: 8,
                                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                padding: '6px 0',
                                minWidth: 160,
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {doc.folderId && (
                                <div
                                  style={{ padding: '6px 14px', fontSize: 12, cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 6 }}
                                  onClick={() => { void handleMoveDocToFolder(doc.id, null); setFolderMenuDocId(null); }}
                                >
                                  ✕ Remove from folder
                                </div>
                              )}
                              {folders.map((f) => (
                                <div
                                  key={f.id}
                                  style={{
                                    padding: '6px 14px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: doc.folderId === f.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    color: 'rgba(255,255,255,0.85)',
                                  }}
                                  onClick={() => { void handleMoveDocToFolder(doc.id, f.id); setFolderMenuDocId(null); }}
                                >
                                  <Folder size={11} />
                                  {f.name}
                                  {doc.folderId === f.id && <Check size={11} style={{ marginLeft: 'auto' }} />}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                      {renamingDocId === doc.id ? (
                        <input
                          ref={renameInputRef}
                          className={styles.renameInput}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => void handleCommitRename(doc.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCommitRename(doc.id);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                        />
                      ) : (
                        <Link to={`/doc/${doc.id}`} className={styles.templateName}>
                          {doc.pinned && <Pin size={11} className={styles.pinIcon} />}
                          {doc.name}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeView === 'trash' && (
            <>
              {trashedDocs.length === 0 ? (
                <p className={styles.emptyState}>Trash is empty.</p>
              ) : (
                <div className={styles.recentsGrid}>
                  {trashedDocs.map((doc) => (
                    <div key={doc.id} className={styles.recentCard}>
                      <div className={styles.recentPreview}>
                        <div className={styles.recentPreviewLine} style={{ width: '70%' }} />
                        <div className={styles.recentPreviewLine} />
                        <div className={styles.recentPreviewLine} style={{ width: '85%' }} />
                        <div className={styles.recentActions} style={{ opacity: 1 }}>
                          <button
                            type="button"
                            className={styles.recentActionBtn}
                            title="Restore"
                            onClick={() => void handleRestore(doc.id)}
                            style={{ background: 'rgb(22 101 52 / 0.85)' }}
                          >
                            ↩
                          </button>
                          <button
                            type="button"
                            className={styles.recentActionBtn}
                            title="Delete permanently"
                            onClick={() => void handlePermanentDelete(doc.id, doc.name)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <span className={styles.templateName} style={{ opacity: 0.6 }}>{doc.name}</span>
                      <span className={styles.templateDesc}>Deleted {new Date(doc.deletedAt ?? 0).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
              {trashedDocs.length > 0 && (
                <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={async () => {
                      if (!window.confirm(`Permanently delete all ${trashedDocs.length} documents? This cannot be undone.`)) return;
                      for (const doc of trashedDocs) await permanentlyDeleteDocument(doc.id);
                      await refreshDocs();
                    }}
                    style={{ color: '#ff453a' }}
                  >
                    Empty Trash
                  </button>
                </div>
              )}
            </>
          )}

          {activeView === 'folder' && (
            <>
              {folderDocs.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>This folder is empty.</p>
                  <p style={{ fontSize: '13px', color: 'var(--dash-text-muted)', marginTop: 8 }}>
                    Open a document and use the folder menu to move it here.
                  </p>
                </div>
              ) : (
                <div className={styles.recentsGrid}>
                  {folderDocs.map((doc) => (
                    <div key={doc.id} className={styles.recentCard} style={{ position: 'relative' }}>
                      <div className={styles.recentPreview}>
                        <div className={styles.recentPreviewLine} style={{ width: '65%' }} />
                        <div className={styles.recentPreviewLine} />
                        <div className={styles.recentPreviewLine} style={{ width: '80%' }} />
                        <div className={styles.recentActions}>
                          <button
                            type="button"
                            className={styles.recentActionBtn}
                            title="Open document"
                            onClick={() => navigate(`/doc/${doc.id}`)}
                          >
                            ↗
                          </button>
                          <button
                            type="button"
                            className={styles.recentActionBtn}
                            title="Move to All Documents (remove from folder)"
                            onClick={() => void handleMoveDocToFolder(doc.id, null)}
                          >
                            ↑
                          </button>
                        </div>
                      </div>
                      <span className={styles.templateName}>{doc.name}</span>
                      <span className={styles.templateDesc}>
                        {new Date(doc.lastModified).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeView === 'home' && searchQuery && (
            <div className={styles.templateGrid}>
              {filteredTemplates.map((template) =>
                renderTemplateCard(template.id, template.name, template),
              )}
              {filteredDocs.map((doc) => (
                <Link to={`/doc/${doc.id}`} key={doc.id} className={styles.recentCard}>
                  <div className={styles.recentPreview}>
                    <FileText size={24} color="#c7c7cc" style={{ margin: 'auto' }} />
                  </div>
                  <span className={styles.templateName}>{doc.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {activeView === 'new' && (
          <footer className={styles.footerBar}>
            <div className={styles.footerLeft}>
              {showPopulateOption && (
                <label className={styles.populateToggle}>
                  <input
                    type="checkbox"
                    checked={populateSample}
                    onChange={(e) => setPopulateSample(e.target.checked)}
                  />
                  <span className={styles.populateLabel}>Fill with sample content</span>
                  <span className={styles.populateHint}>Skip the wizard — use realistic example text</span>
                </label>
              )}
              {selectedTemplate?.premium && !isPro && (
                <p className={styles.proLockHint}>
                  <Lock size={12} /> Pro template — upgrade to create, or choose a free template.
                </p>
              )}
              {selectedTemplate?.premium && selectedTemplate.features && (
                <p className={styles.selectedFeatures}>
                  Includes: {selectedTemplate.features.join(' · ')}
                </p>
              )}
            </div>
            <div className={styles.footerActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => { setSelectedTemplateId('blank'); setPopulateSample(false); }}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.createBtn} ${styles.createBtnPrimary} ${selectedTemplate?.premium && !isPro ? styles.createBtnPro : ''}`}
                onClick={() => void handleCreate()}
              >
                {selectedTemplate?.premium && !isPro ? (
                  <><Sparkles size={14} /> Unlock with Pro</>
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </footer>
        )}
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        defaultView={profileDefaultView}
      />
      <SearchPalette isOpen={isSearchOpen} onClose={closeSearch} />
      <ProUpgradeModal
        isOpen={isUpgradeOpen}
        onClose={() => { setIsUpgradeOpen(false); setUpgradeReason(undefined); }}
        reason={upgradeReason}
      />
      <TemplateWizardModal
        isOpen={Boolean(wizardTemplate)}
        template={wizardTemplate}
        displayName={user?.displayName}
        onClose={() => setWizardTemplate(null)}
        onSkip={handleWizardSkip}
        onComplete={(content, name) => void handleWizardComplete(content, name)}
      />
      <TemplatePreviewModal
        template={previewModalTemplate}
        onClose={() => setPreviewModalTemplate(null)}
      />
    </div>
  );
}
