# KaiProofread + KaiKeys — Phase 0 audit (cloud side)

_Last updated: 2026-10-25. Status: **partial** — the local Mac workspace has not been inspected yet._

## What this audit can and cannot see

This audit was produced in a cloud session. It can read the GitHub repositories
listed below. It **cannot** read `/Users/jacksonlwinga/Developer/MPJL_APPS`, and
the owner has confirmed that the local workspace contains files that are not on
GitHub. Absence of KaiProofread or KaiKeys code in this audit is therefore
**not** evidence that it doesn't exist. Every claim below is labelled:

- **Verified** — read directly from a GitHub commit named here, and (where stated) tested.
- **Unverified** — known or claimed to exist locally, not visible from here.

The local half is covered by `scripts/kai-local-audit.sh` (see
`KAIPROOFREAD_KAIKEYS_LOCAL_AUDIT.md`).

### GitHub code inspected

| Repository | Branch / commit | Inspected for |
|---|---|---|
| `jacklwinga-cyber/KaiWriter` | `develop` @ `3844cd7` (2026-09-29) | proofreading, keyboard, extension, Tauri |
| | `claude/recommendations` @ `bc3c6b9` (2026-09-29) | same |
| | `claude/great-turing-ps5a2g` @ `3055181` (2026-10-15), plus this session's work | same |
| `jacklwinga-cyber/KAIHUB` | default @ `46dcbb3` (2026-09-29) | same, plus auth and shared packages |
| `jacklwinga-cyber/KaiDocs-Pro` | `main` @ `94c729b` (2026-10-22) | same |
| All 23 repositories on the account | names only | anything named KaiProofread, KaiKeys, KaiBrowser |

Search method: file-name and content search for proofread / grammar / spell /
LanguageTool / keyboard / InputMethodService / UIInputViewController /
`com.apple.keyboard-service` / extension `manifest_version`, excluding
`node_modules`, build output and `.git`.

## Comparison: known local structure vs GitHub

| Known local item (from the brief) | On GitHub? | Status |
|---|---|---|
| `MPJL_APPS/` (workspace root) | No single repo; projects are separate repos | Folder layout **unverified** |
| `KaiWriter/` | Yes — `KaiWriter` | **Verified** (3 branches above) |
| `KaiWriter/src/components/ui/PremiumProofreadingSettings.tsx` | **Not on any of the 3 branches** | **Unverified** — exists only locally (uncommitted, or committed on an unpushed branch) |
| `KaiWriter/src/lib/__tests__/advancedProofreading.test.ts` | **Not on any of the 3 branches** | **Unverified** — same |
| `KaiWriter/src-tauri/` | Yes (`develop`) | **Verified**: Tauri v2 shell, `com.kaiwriter.desktop` v0.1.0, `main.rs` + `lib.rs`; no proofreading code in Rust |
| `KaiBrowser/` | **No repository** | **Unverified** — any extension code is local-only |
| `KAIHUB/` | Yes — `KAIHUB` | **Verified**: Turborepo with `apps/web` (Next.js 15), `apps/mobile` (Expo 54 / React Native 0.81), `packages/shared`, Supabase email/password auth. **No** proofreading, keyboard or extension code at `46dcbb3` |
| `KAIHUB_PHASE_BETA/` | **No repository** | **Unverified** |
| `KaiDocs Pro/` | Yes — `KaiDocs-Pro` | **Verified**: Next.js document suite. **No** writing-assistance code; `src/lib/content-edit/rewrite.ts` is PDF content-stream text replacement, not proofreading |
| Anything named KaiProofread / KaiKeys | No repository or file with these names | **Unverified** — must be checked locally |

## Verified: KaiWriter's proofreading today

KaiWriter is the only place on GitHub with writing-assistance code.

| Part | File | What it does |
|---|---|---|
| Client engine | `src/lib/writingAssist.ts` | Runs three checkers: LanguageTool's public API (`api.languagetool.org`), local regex rules (repeated words, sentences over 35 words, 8 wordy phrases, passive voice), and the AI edge function. Merges and de-duplicates the results |
| Review panel | `src/components/editor/plugins/WritingAssistSidebarPlugin.tsx` | Grammar / Suggestions tabs, whole-document or selection scope, apply and dismiss |
| Text ↔ editor mapping | `src/lib/plainTextMap.ts` | Maps plain-text offsets to Lexical text nodes |
| AI edge function | `supabase/functions/writing-assist/index.ts` | Calls Claude (`claude-sonnet-4-20250514`) for style/clarity suggestions |
| Proofing language | `src/lib/editorPreferences.ts` | 10 locales incl. en-US and en-GB, passed to LanguageTool |
| Entry points | Review ribbon (Spelling & Grammar, Writing Suggestions, Proofread) | |

### Defects found (all reproduced by tests before being fixed)

| # | Defect | Effect |
|---|---|---|
| D1 | `analyzeWriting` trimmed the text before checking, but fixes were applied to the untrimmed text | A document starting with a blank line had every fix shifted one character: **text corruption** |
| D2 | After one fix was applied, the remaining suggestions kept their old positions | The next fix could land on the wrong characters: **text corruption** |
| D3 | A fix was never checked against the text currently at that position | Editing after a check, then applying, changed whatever text was there now |
| D4 | A fix spanning two text nodes (e.g. part bold) only changed the first | Left a fragment of the old word behind |
| D5 | AI positions were used as-is | LLM offsets are often wrong, so AI fixes could replace the wrong text |
| D6 | The edge function returned `{"issues":[]}` with HTTP 200 for **every** failure (missing key, provider error, bad JSON, exception) | "No suggestions" was shown when the service was broken |
| D7 | The client turned any AI failure into an empty list (`catch {}` and `if (!response.ok) return []`) | Same as D6, on the client side |
| D8 | A LanguageTool failure threw, discarding the local results too | One service outage hid all results |
| D9 | No timeouts, retries or cancellation; a stale check could overwrite a newer one | Hangs; out-of-date results |
| D10 | Document text was concatenated into the prompt with no data/instruction boundary | Text pasted into a document could steer the model (prompt injection) |
| D11 | No input size limit on the edge function | Unbounded cost per request |
| D12 | Text was sent to LanguageTool and the AI with no disclosure or consent | Privacy gap (also flagged in `KAIWRITER_PRODUCT_TECHNICAL_AUDIT.md`) |
| D13 | Selection-scope fixes searched for the first occurrence of the word in the selected nodes | Could fix a different occurrence than the one reported |
| D14 | Text pending deletion under track changes was proofread | Suggestions on text that is about to be removed |

**Fixed in this session.** See `KAIPROOFREAD_KAIKEYS_PROGRESS.md` for the changes and tests.

### Verified gaps (not defects, just absent from KaiWriter on GitHub)

- No personal dictionary, ignore-word or ignore-rule list.
- No live (as-you-type) proofreading or inline underlines; checks run on demand in the side panel.
- The local rules are English-only, even when a French or German proofing locale is selected.
- No AI rewrite, tone, shorten or expand actions on a selection.
- No per-user usage limits, quotas or token accounting for the AI function (it now returns token usage, but nothing stores it).
- The edge function's CORS policy is `*`. Access still requires a Supabase JWT.

## Unverified: needs the local audit

- What `PremiumProofreadingSettings.tsx` configures, and whether it uses `writingAssist.ts` or a separate engine.
- What `advancedProofreading.test.ts` tests, and whether it passes.
- Whether KaiBrowser contains a browser extension, and for which browsers.
- Whether any native keyboard code (iOS keyboard extension, Android IME) exists anywhere locally.
- Whether `KAIHUB_PHASE_BETA` holds shared auth or settings meant for these products.
- Whether the local KaiWriter has also pulled the `claude/great-turing-ps5a2g` work (PR #2). If not, the two lines of work have diverged and will need merging.

## Environment limits that affect later phases

| Limit | Effect |
|---|---|
| Cloud session cannot reach the Mac | Local code can only be audited by the owner running the script |
| No macOS or Xcode in the cloud | iOS / iPadOS keyboard extension and Safari extension cannot be built or tested here |
| `dl.google.com` is blocked by the environment's network policy | The Android SDK can't be installed, so the Android keyboard can't be built here until that host is allowed |
| `api.languagetool.org` is blocked | Live LanguageTool calls can't be tested here; they are tested against recorded responses |
| No `ANTHROPIC_API_KEY` in the cloud session | The edge function's live Claude call is not tested; all of its non-network paths are |
