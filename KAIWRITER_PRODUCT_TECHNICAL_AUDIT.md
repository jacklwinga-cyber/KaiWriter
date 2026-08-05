# KaiWriter — Product & Technical Audit

**Audited:** 2026-08-05  
**Auditor:** AI-assisted inspection of live source at `/KAIWRITER`  
**Branch/state:** Local working copy (Vite/React/Tauri, no active git status checked)

---

## Repository & Architecture Findings

| Property | Value |
|---|---|
| Framework | React 19 + Vite 8 + TypeScript 6 |
| Primary editor | Lexical 0.45 (Meta open-source) |
| Routing | React Router v7 |
| Persistence | IndexedDB (custom wrapper, DB v3) + Supabase Postgres cloud |
| Auth | Supabase Auth (email OTP + Google OAuth) + local PIN |
| AI architecture | Supabase Edge Functions (`writing-assist`, `create-checkout`, `create-portal`) |
| Cloud sync | Supabase `kaiwriter_documents` + `kaiwriter_comments` + `kaiwriter_subscriptions` |
| Payments | Stripe (monthly/annual Pro, $9.99/$79) |
| Desktop shell | Tauri v2 (thin wrapper, minimal Rust backend) |
| Styling | CSS Modules |
| Tests | **None** |
| Deployment | Vercel (web) + Tauri (desktop) |

---

## What KaiWriter Actually Does Today

KaiWriter is a browser-first / Tauri-desktop document editor. Users can:

- Create documents from 30+ templates (business, finance, academic, personal, legal, marketing, creative, productivity)
- Write using a Lexical-powered rich text editor with a Word-style ribbon (Home / Insert / Layout / Review / View tabs)
- Auto-save to IndexedDB every 800 ms debounce, with version snapshots every 15 min (Pro only)
- Optionally sync documents to Supabase cloud (cloud accounts only)
- Export to TXT/PDF (browser print) and DOCX (Pro only, via the `docx` library)
- Get grammar/style suggestions via LanguageTool + local clarity rules + optional AI Edge Function
- Use "Kai Assist" to auto-fill template placeholders via AI
- Organise by pinning documents in a flat list
- Add inline comments
- Switch between light/dark theme, page size, margins, and zoom
- Apply document branding (logo/colours — Pro only)

---

## Feature Map

### Working and solid
- Lexical rich-text core (paragraphs, headings H1–H6, bold/italic/underline/strike, lists, tables, links, images, blockquotes, code blocks)
- 800 ms debounced autosave to IndexedDB *(with a caveat below)*
- 30+ templates with wizard + AI fill
- Version history store (50 max, 15 min auto interval) — *now unlocked for admin*
- LanguageTool + local clarity/passive-voice/wordy-phrase checks
- Find & Replace plugin
- DOCX export (handles headings, tables, images, formatting)
- Cloud sync (merge-on-login, push-on-save)
- Tauri desktop app shell
- Comments sidebar
- Navigation sidebar (heading outline)
- Focus mode
- Document branding (Pro)
- Styles sidebar (font, size, line-height, spacing)
- Status bar (word count, character count)
- Keyboard shortcuts plugin
- Kai Assist (template placeholder AI fill + storyboard image generation)
- Multi-account system: guest / PIN / cloud

### Partial or incomplete
- PDF export (`window.print()` — no layout control, headers, footers, page numbers)
- Writing statistics (word count in status bar only; no reading time, paragraph count, writing goal)
- Trash / archive (hard-delete only — no recycle bin, no restore)
- Offline conflict resolution (last-modified-wins, no merge)
- AI writing suggestions (Edge Function must be deployed; silently returns nothing if not)

### Missing entirely
- Projects / folders / nested organization
- Tags
- Full-text search across document library
- Command palette (⌘K)
- Slash commands
- Writing goals (word targets)
- Session crash recovery (no emergency snapshot on unload)
- Import (Markdown, DOCX, HTML, RTF)
- Citation / reference manager
- Research workspace
- Dark/light mode tested for editor surface (CSS variables present, untested systematically)
- Accessibility pass

---

## UI/UX Assessment

### What works
The ribbon UI (Home/Insert/Layout/Review/View) is familiar to users who know Word/Pages. Focus mode is a nice touch. The template gallery is visually polished.

### What's frustrating

**1. Dashboard navigation is confusing.**  
There are three top-level views — Home, New, Recents — but "Home" shows industry packs that lead to "New". The split between Home and New is unclear. Most users will never discover the industry packs.

**2. Templates don't show their content.**  
Template thumbnails are tiny white rectangles or static PNGs. Users cannot tell what a Business Plan looks like vs. a Project Proposal without clicking and reading the detail panel. Descriptions were hidden until we added them today.

**3. 3-document free limit is too aggressive.**  
Users hit the wall after three documents. For a writing app, this feels punitive rather than motivating. The limit blocks people before they understand the product's value.

**4. Flat document library with no organization.**  
There are no folders, projects, or tags. A user working on a book, a blog, and a report sees all documents in one unsorted pile (only pinning is available). This is the single biggest UX gap for serious writers.

**5. Recent document cards show grey lines, not content.**  
The Recents grid renders placeholder line-art instead of any real content preview. Users cannot distinguish documents by appearance — only by name.

**6. The Pro wall on DOCX export is confusing.**  
DOCX is a foundational writing feature. Locking it behind Pro without a clear free export path (other than TXT and browser-print PDF) frustrates users who want to share their work.

**7. PDF export is browser print.**  
`window.print()` opens the system print dialog. This gives no control over margins, headers/footers, page numbers, or cover pages. Professional writers expecting a proper PDF will be disappointed.

**8. No ⌘K command palette.**  
Power users have no fast way to invoke features. Everything requires finding the right ribbon tab.

**9. Kai Assist only fills placeholders.**  
The AI writing assistant cannot rewrite, expand, shorten, summarise, or critique user text. It only fills `[placeholder]` tokens in templates. This is well below the bar users expect from "AI writing assistant."

---

## Editor Assessment

### Strengths
- Lexical is the right choice. It is actively maintained by Meta, extensible, and used by Facebook, Figma, and others. It handles undo/redo, multi-node selection, tables, and images well.
- The plugin architecture (each feature is a LexicalPlugin) is the correct Lexical pattern.
- The debounced save registers on `editor.registerUpdateListener`, which is the canonical approach.

### Weaknesses

**A. No crash/session recovery.**  
If the browser tab crashes or the user force-quits mid-edit, content written in the last 800 ms is lost. There is no `beforeunload` emergency flush and no recovery draft stored separately from the main document.

**B. Debounce identity bug.**  
`DocumentSavePlugin` creates the debounced `persist` function via `useCallback` with `[documentId, documentName, templateId, setSaveStatus, isPro, branding]` as dependencies. When the user renames the document, `documentName` changes → a new debounced function is created → the previous debounce timer is cancelled and the clock restarts. During fast rename+edit sequences, this can silently delay saves.

**C. No `onError` surface.**  
`EditorCanvas` uses `LexicalErrorBoundary` but does not show any user-visible recovery UI. If Lexical throws internally, the editor silently disappears.

**D. Large God component: `EditorLayout` in `EditorView.tsx`.**  
`EditorLayout` handles: document naming, tab state, sidebar pane state, focus mode, page layout state, branding, AI Assist, version history modal, DOCX export, TXT export, PDF export, writing assist, and placeholder count. It is ~250 lines and will become extremely hard to maintain. It should be decomposed.

**E. Version history is 15-min interval only (was Pro-gated).**  
Now that admin mode enables Pro, versions are auto-saved. But 15 minutes is a long interval — a major rewrite done and discarded within 14 minutes leaves no recovery point beyond undo history.

---

## AI Assessment

### What exists
- **Kai Assist:** Sends template plain text + brief to `VITE_SUPABASE_URL/functions/v1/kai-assist` (assumed) or uses a local fallback. Fills `[placeholder]` tokens. Generates storyboard images via Pollinations.ai.
- **Writing Assist:** Calls LanguageTool public API + local rule engine + `functions/v1/writing-assist` for AI suggestions. Dedupes results by offset. Three source tiers: `languagetool`, `local`, `ai`.
- **AI Template Assist fallback:** If the Edge Function is unavailable, a `localAssistFallback` fills common tokens like `[Date]`, `[Your Name]`, `[Client Name]` and generates Pollinations storyboard images.

### Weaknesses

**A. No AI rewrite, expand, shorten, or summarise.**  
The most-wanted AI writing features (rewrite selection, improve paragraph, change tone) do not exist. The AI only fills placeholders.

**B. No AI change preview/diff.**  
When Kai Assist fills placeholders, it writes directly into the editor with no preview. Users cannot see what changed or reject specific fills.

**C. Edge Functions may not be deployed.**  
`writing-assist` silently returns `[]` on any error (`try { aiIssues = ... } catch { /* AI assist is optional */ }`). Users get no feedback when AI features are unavailable.

**D. Provider is hardcoded to Supabase.**  
Every AI call is a fetch to the Supabase URL. There is no provider abstraction. Adding a direct Anthropic/OpenAI call requires touching every call site.

**E. Pollinations.ai for images.**  
The storyboard image generator uses `https://image.pollinations.ai/prompt/...` — a free public service. No API key, no rate limit, no guarantee of availability or content safety.

**F. Prompt injection risk in template content.**  
AI assist passes the full document plain text to the Edge Function. If a document contains injected instructions (e.g., from a pasted web source), there is no separation between document content and system instructions.

---

## Persistence & Data-Loss Assessment

### Strengths
- IndexedDB is correct for local-first document storage.
- Cloud sync on every save (for cloud accounts).
- Version history with 50-version cap.
- Migration from legacy localStorage on first load.

### Risks

**A. `deleteDocument` is permanent and instant.**  
The dashboard shows a `window.confirm` before deletion, but the actual IndexedDB delete and cloud delete happen immediately. There is no trash table. A user who accidentally deletes a document loses it permanently unless they have cloud sync.

**B. Cloud sync conflict resolution loses data.**  
`mergeCloudIntoLocal` uses: if `cloudDoc.lastModified > local.lastModified`, take cloud. This means: edit on device A offline → edit on device B offline → go online on A, then B → the B version overwrites A's work silently. No merge, no "keep both" option.

**C. No `beforeunload` emergency flush.**  
The 800 ms debounce saves are not flushed on tab close. If a user writes fast and immediately closes the tab, the last edit may not persist.

**D. IndexedDB schema upgrade is incomplete.**  
`versionStore.ts` checks `if (oldVersion < 1 && !db.objectStoreNames.contains('documents'))` — but the current DB_VERSION is 3. Users upgrading from v1→3 may not get the `versions` or `comments` object stores created if the `onupgradeneeded` handler in that file doesn't run all migration steps for intermediate versions.

**E. `saveDocumentLocal` is exported alongside `saveDocument`.**  
`saveDocumentLocal` bypasses cloud sync. If called directly (which it is, in `mergeCloudIntoLocal`), it saves without triggering a cloud push. This is intentional but creates two code paths that could diverge.

---

## Security & Privacy Assessment

### Strengths
- AI API keys are server-side in Supabase Edge Functions (not exposed to client).
- Supabase auth tokens flow correctly through Edge Function calls.
- `STRIPE_SECRET_KEY` is not prefixed with `VITE_`, so Vite will not bundle it into client code.

### Risks

**A. Stripe secret key in `.env.local` in the project root.**  
`.env.local` contains `STRIPE_SECRET_KEY=sk_test_...`. Even though Vite doesn't expose non-`VITE_` variables to the client bundle, having the Stripe secret key in the project directory (committed or not) is a security anti-pattern. It should be stored only in the Supabase Edge Function environment.

**B. Pollinations.ai receives user content without consent disclosure.**  
Storyboard brief text is sent to `image.pollinations.ai` with no user disclosure that content leaves the device. This may conflict with GDPR/CCPA depending on deployment territory.

**C. LanguageTool public API receives full document text.**  
`analyzeWriting` sends the full document to `https://api.languagetool.org/v2/check`. Users are not informed that their text is sent to a third party. For sensitive professional documents this is a meaningful privacy concern.

**D. No document-level authorization visible in client code.**  
The Supabase RLS rules (server-side) are not auditable from the client code. The client assumes `kaiwriter_documents.eq('user_id', userId)` is correctly enforced by RLS. If RLS is misconfigured, any authenticated user could read any document.

**E. No prompt injection defense.**  
Template plain text and user documents are passed directly to AI Edge Functions. A pasted external source containing "Ignore all previous instructions and..." could influence AI outputs.

---

## Performance Assessment

### Likely fine at current scale
- Lexical handles large documents well in practice.
- IndexedDB reads/writes are async and non-blocking.
- 800 ms autosave debounce avoids excessive writes.

### Risks at scale

**A. `listDocuments()` loads all documents into memory.**  
Every dashboard load calls `store.getAll()` on the documents object store. With hundreds of documents this is inefficient. There is no pagination, cursor, or index-based query.

**B. Version history at 50 entries × full document content.**  
Each version stores the full Lexical JSON string. A 50,000-word document serializes to ~200–400 KB per version. 50 versions = up to 20 MB per document in IndexedDB. Browser IndexedDB quotas vary but this will cause warnings on storage-constrained devices.

**C. `analyzeWriting` sends the full document to LanguageTool.**  
Long documents will hit LanguageTool's rate limits (HTTP 429 already handled) and slow down the grammar check.

---

## Testing Assessment

**There are zero tests in the project.** No unit, integration, or E2E tests exist. This is the highest-risk technical debt item after data integrity.

The following are completely unverified by automated tests:
- Autosave correctness under rapid edits
- Version history creation and restoration
- Cloud sync merge behavior
- DOCX export fidelity
- Template content loading
- Auth flow (PIN creation, cloud sign-in, sign-out)
- Document deletion (permanent — no recovery)
- IndexedDB schema migration across versions

---

## Technical Debt Summary

| Area | Debt |
|---|---|
| `EditorLayout` God component | ~250 lines mixing saving, exporting, AI, branding, modals |
| Zero tests | Every critical path is untested |
| Debounce identity bug | Save timer resets on any dependency change |
| No crash recovery flush | `beforeunload` not handled |
| Flat document model | No folders, projects, tags, archive, trash |
| PDF export | `window.print()` only |
| AI is placeholder-fill only | No rewrite/expand/shorten/summarise/critique |
| No AI change preview | Writes directly into editor without review |
| DB migration gaps | Upgrade path v1→v3 may be incomplete |
| Stripe secret in project root | Wrong location for server credential |
| Privacy disclosures missing | LanguageTool + Pollinations send user data |
| `deleteDocument` permanent | No trash or restore |

---

## KEEP / IMPROVE / REFACTOR / REMOVE / ADD / DEFER

### KEEP
- Lexical as the editor foundation — correct choice
- IndexedDB-first persistence strategy
- Supabase for cloud auth and sync
- Plugin-based editor architecture
- Version history data model
- Template system (wizard, categories, packs)
- LanguageTool + local rules for writing analysis
- DOCX export (well-implemented)
- Tauri desktop wrapper
- Document branding (Pro feature, well-designed)
- CSS Modules styling approach
- Ribbon-style toolbar concept

### IMPROVE
- Autosave: fix debounce identity bug; add `beforeunload` emergency flush; show fine-grained status (Saving / Saved / Offline / Retry)
- Version history: reduce auto interval from 15 min to 5 min; allow viewing diffs; gate on Pro but offer free "last 3 versions"
- Cloud sync: add conflict detection ("document edited on two devices") with "Keep local / Keep cloud / Keep both" UI
- Template cards: descriptions now visible (applied today); add category badge; show first feature
- Dashboard: merge Home + New into single view; show packs as category filters, not a separate screen
- Recent document cards: show actual document preview (first line of content as title hint)
- PDF export: replace `window.print()` with proper PDF generation (Puppeteer server-side or jsPDF client-side)
- Writing stats: move to dedicated panel with reading time, paragraphs, sentences
- Free document limit: raise from 3 to 10, or remove the cap and gate on Pro features instead

### REFACTOR
- `EditorLayout` (EditorView.tsx): decompose into `useDocumentPersistence`, `useExport`, `useAI`, `useSidebar` hooks
- `AuthProvider.tsx`: extract subscription logic into `useSubscription` hook
- AI calls: create `AIService` abstraction with provider interface (Supabase Edge Function as first implementation)
- `documentStore.ts`: add `archiveDocument`, `trashDocument`, `restoreDocument`, `listTrashed` alongside existing CRUD
- Database upgrade path: audit and fix `onupgradeneeded` across all three DB users to handle v1→v2→v3 cleanly
- Template content: add `plainTextSnapshot` alongside Lexical JSON for searchable content

### REMOVE
- `LegacyPinProBanner` / `legacyPinPro.ts`: once migration is stable, remove the legacy pin-to-pro migration banner
- Pollinations.ai direct calls: replace with a server-side image generation call that respects privacy
- `localStorage` migration path: can be removed after sufficient time (currently migrates on every load)

### ADD (Priority order)
1. **`beforeunload` emergency flush** — prevents data loss on tab close (P0)
2. **Trash / Soft-delete** — `deletedAt` field, Trash view, restore and permanent-delete (P0)
3. **Session crash recovery** — emergency snapshot to a separate IDB key every 30 seconds (P0)
4. **Full-text content search** — search document content, not just names (P1)
5. **Folders / Projects** — nested organization for serious writers (P1)
6. **AI rewrite/expand/shorten/summarise** — selection-aware AI actions (P1)
7. **AI change preview/diff** — show proposed vs. original before applying (P1)
8. **Command palette (⌘K)** — fast access to all features (P2)
9. **Writing goals** — word count target per document with progress bar (P2)
10. **Tags** — flexible label system across documents (P2)
11. **Proper PDF export** — layout-controlled, with headers/footers/page numbers (P2)
12. **Import** — Markdown, TXT, HTML at minimum (P2)
13. **Privacy disclosures** — inform users before sending content to LanguageTool / AI (P2)
14. **Test suite** — start with autosave, export, and document CRUD (P1, ongoing)
15. **Slash commands** — `/heading`, `/table`, `/image` in the editor (P3)
16. **Research workspace** — notes + sources side panel (P3)
17. **Citation manager** — APA/MLA/Chicago structured references (P3)
18. **Writing statistics panel** — full stats with daily words and reading time (P3)

### DEFER
- Real-time collaboration (requires CRDT layer or Supabase Realtime — significant architecture change)
- Custom user templates (nice to have, not blocking)
- KaiVault / KaiBrowser / KaiCalendar integrations (design the interface contract first)
- Academic citation styles beyond basic formatting
- Typewriter mode (fun, low-priority)
- Writing streaks / gamification (avoid unless deliberately designed)

---

## Proposed Target Architecture

```
KaiWriter
├── views/
│   ├── DashboardView          (template gallery + document library)
│   └── EditorView             (orchestrator only — no logic)
│
├── features/
│   ├── document/
│   │   ├── useDocumentPersistence   (save, autosave, flush)
│   │   ├── useDocumentLifecycle     (create, archive, trash, restore)
│   │   └── documentStore            (IndexedDB CRUD — current, extended)
│   ├── versions/
│   │   ├── useVersionHistory
│   │   └── versionStore
│   ├── sync/
│   │   ├── useCloudSync
│   │   └── cloudSync (conflict detection added)
│   ├── ai/
│   │   ├── AIService                (provider interface)
│   │   ├── providers/SupabaseAI     (current Edge Function calls)
│   │   ├── operations/              (RewriteOp, SummariseOp, CritiqueOp...)
│   │   └── useAIAssist              (streaming, cancel, preview state)
│   ├── grammar/
│   │   └── writingAssist (current, unchanged)
│   ├── export/
│   │   ├── exportDocx
│   │   ├── exportPdf                (replace window.print)
│   │   └── exportPlainText
│   ├── projects/
│   │   ├── projectStore             (new)
│   │   └── folderStore              (new)
│   └── search/
│       └── documentSearch           (full-text IDB search)
│
├── editor/
│   ├── EditorCanvas
│   ├── plugins/                     (current plugins)
│   ├── ribbon/                      (current ribbons)
│   └── nodes/                       (current nodes)
│
├── contexts/
│   ├── AuthProvider                 (cleaned up)
│   └── EditorChromeContext
│
└── lib/ (shared utilities, no feature logic)
```

---

## Prioritised Implementation Roadmap

### Phase 0 — Data Integrity (P0 — do first)
**Goal:** No user should lose a character of work.

| Task | Why |
|---|---|
| Add `beforeunload` flush to DocumentSavePlugin | Tab close silently discards last edit |
| Add 30-second emergency crash snapshot to separate IDB key | Recovery on restart |
| Fix debounce identity bug in DocumentSavePlugin | Silent save delays on rename |
| Add soft-delete / Trash (`deletedAt`, restore, permanent delete) | `deleteDocument` is permanent today |
| Audit and fix IDB schema migration v1→v3 | New users on fresh installs may skip store creation |
| Write tests for autosave, versions, and delete | These paths have zero coverage |

### Phase 1 — Library & Organization (P1)
**Goal:** A serious writer can organize their work.

| Task |
|---|
| Add folders / projects to document model |
| Add tags to document model |
| Full-text content search (IDB cursor scan with plain text snapshot) |
| Archive state (soft-hide without deletion) |
| Dashboard UI: folders sidebar, tag filter, search-in-content |

### Phase 2 — Professional Editor (P1–P2)
**Goal:** The editor matches professional writer expectations.

| Task |
|---|
| Command palette (⌘K) |
| Slash commands (`/heading`, `/table`, `/image`, `/ai`) |
| Writing goals (word target + progress) |
| Writing statistics panel (reading time, paragraphs, sentences) |
| Proper PDF export (jsPDF or server-side Puppeteer) |
| Import: Markdown, TXT, HTML |

### Phase 3 — Kai AI (P1)
**Goal:** AI assists writing, not just templates.

| Task |
|---|
| AIService abstraction layer |
| Selection-aware actions: rewrite, expand, shorten, summarise, change tone |
| AI change preview/diff UI (accept / reject / try again) |
| AI streaming |
| Privacy disclosure before first AI call |
| Context management (selection → paragraph → section — not full doc) |

### Phase 4 — Polish & Trust (P2)
**Goal:** The app feels premium and reliable.

| Task |
|---|
| Cloud sync conflict UI ("document edited on two devices") |
| Accessibility pass (ARIA labels, keyboard nav, contrast) |
| Error handling upgrade (actionable messages, not "something went wrong") |
| Dark/light theme systematic testing |
| Stripe secret key moved to Supabase secrets only |
| LanguageTool + Pollinations privacy disclosure |

### Phase 5 — Research & Citations (P3)
| Task |
|---|
| Research notes side panel |
| Source library (URL, title, author, date) |
| Structured citation insert |
| Bibliography generation |

### Phase 6 — Kai Ecosystem Integration (P3–P4)
| Task |
|---|
| Define `KaiWriterIntegrationService` interface |
| KaiHub: open/create/summarise documents |
| KaiVault: archive completed documents |
| KaiNotes: send selection as note |
| KaiBrowser: receive researched source |

---

## Files Most Likely Affected by Phase 0

| File | Change needed |
|---|---|
| `src/components/editor/plugins/DocumentSavePlugin.tsx` | Fix debounce identity bug; add `beforeunload` flush; add crash snapshot |
| `src/lib/documentStore.ts` | Add `archiveDocument`, `trashDocument`, `restoreDocument`, `listTrashed` |
| `src/lib/versionStore.ts` | Reduce auto interval to 5 min; fix upgrade path |
| `src/views/DashboardView.tsx` | Add Trash view; add archive toggle |
| `src/views/EditorView.tsx` | Begin decomposing EditorLayout into hooks |
| `src/lib/cloudSync.ts` | Add conflict detection; add "keep both" option |

---

## Recommended First Implementation Phase

**Phase 0 — Data Integrity** should begin before any new features are added.

The current app has three unsolved data-loss scenarios:

1. User writes → tab crashes → loses up to 800 ms of content (no `beforeunload` flush, no crash snapshot)
2. User deletes a document → it is gone forever (no trash, no undo)
3. User edits on two devices offline → goes online → one version is silently overwritten

These are reliability failures, not feature gaps. A premium writing platform cannot ship with them unresolved.

After Phase 0 is complete and tested, Phase 3 (Kai AI rewrite/expand/summarise) will unlock the biggest perceived upgrade in user value — because AI writing assistance is the capability users already expect and cannot find.

---

*This audit reflects the state of the repository as inspected on 2026-08-05. Implementation should not begin until this document has been reviewed and Phase 0 authorised.*
