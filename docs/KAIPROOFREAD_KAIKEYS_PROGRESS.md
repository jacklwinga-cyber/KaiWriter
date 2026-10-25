# KaiProofread + KaiKeys — progress

_Last updated: 2026-10-25._

## Current phase

**Phase 0 (discovery and preservation): cloud side done; local side waiting on the owner.**

No new products have been created. Per the brief, KaiProofread and KaiKeys
structure is on hold until the local implementations are inspected
(`KAIPROOFREAD_KAIKEYS_LOCAL_AUDIT.md`). The only code changes are fixes to
KaiWriter's existing proofreading engine.

## Phase 1, cloud part (KaiWriter engine, no new products)

| Feature | Files | Verified by |
|---|---|---|
| Personal dictionary | `src/lib/personalDictionary.ts`, Review panel | 5 unit tests; browser: add "gray", its card disappears, word stored, listed with remove |
| UK/US spelling consistency (offline), locale-aware local rules, better repeated-word check | `src/lib/englishVariants.ts`, `src/lib/writingAssist.ts` | 8 unit tests; browser: en-GB flags favorite/color/gray offline |
| Readability statistics | `src/lib/readability.ts`, Review panel | 5 unit tests; browser card: "Easy: reading ease 87/100, grade 4.2" |
| Inline highlights | `src/components/editor/proofreadHighlights.ts`, `piecesForRanges` in `plainTextMap.ts`, `src/index.css` | unit test for the range mapping; browser: 3 underlines, 2 after one fix, 0 after closing the panel |

Bugs found and fixed while testing these:
- **Readability:** a global regex reused with `.test()` skipped every other sentence.
- **Readability:** "-ted"/"-ded" endings lost a syllable.
- **Review panel:** the automatic check that runs on opening it was cancelled by React StrictMode's double mount and never re-ran.
- **Highlights:** an update listener's return value was treated by Lexical 0.45 as a cleanup function and crashed the panel.
- **Review panel:** the "Turn on online checks" button stretched to fill the panel.

Tests: **226 / 226 pass**; build passes; lint unchanged (44, all pre-existing).

## Live checking as you type

| Feature | Files | Verified by |
|---|---|---|
| Offline live proofreading with click-to-fix cards | `src/components/editor/plugins/LiveProofreadPlugin.tsx`, `src/lib/liveProofread.ts`, `getCaretPlainOffset` in `plainTextMap.ts` | 4 unit tests; browser: underlines after the pause with the panel closed, card fix / Ignore / Add to dictionary / Escape, paused while the panel is open, off switch remembered, no outbound requests carrying text |
| Live Check switch | Review ribbon, `liveProofreading` preference | browser |
| Dictionary kept in sync between the live card and the panel | `DICTIONARY_CHANGED_EVENT` in `personalDictionary.ts` | browser |
| Underline performance | `proofreadHighlights.ts` (near-viewport only, static ranges, repaint on scroll), binary search in `piecesForRanges` | measured: per-keystroke cost from about +110 ms to +0 ms on realistic text, +26 ms on a worst case; underlines follow scrolling |

Bugs found while measuring: repainting every underline on every keystroke, and
unbounded underline counts, made typing about 5× slower on a 30,000-character
document. Fixed as above.

Tests: **230 / 230 pass**; build passes; lint unchanged.

## Phase 0 work

### KaiWriter proofreading fixes (defects D1–D14 in the audit)

| Change | Files |
|---|---|
| Shared, dependency-free core: issue validation, re-anchoring model positions by text, coded user-safe errors, injection-resistant prompt | `supabase/functions/_shared/writingAssistCore.ts` (new) |
| Edge function: official Anthropic SDK (`npm:@anthropic-ai/sdk@0.133.0`), sign-in required, 20,000-character cap, 25 s timeout with 1 retry, refusal and truncation handled, explicit HTTP error codes, logs error codes only (never text), model configurable via `WRITING_ASSIST_MODEL` (default unchanged), returns token usage | `supabase/functions/writing-assist/index.ts` |
| Client engine: no trimming (D1); per-checker status instead of silent empty results (D6–D8); timeouts, a retry on server errors, cancellation (D9); LanguageTool size limit and bounds-checked matches; AI issues re-validated against the text sent; consent gate for online checks (D12) | `src/lib/writingAssist.ts` |
| Safe application of suggestions: verify text before editing (D3), multi-node edits (D4), refuse paragraph-crossing edits, batch "accept all", selection mapped to document positions (D13), tracked deletions excluded (D14) | `src/lib/plainTextMap.ts`, `src/lib/suggestionOffsets.ts` (new) |
| Review panel: consent card, per-checker notices, stale-check cancellation, offsets shifted after each fix (D2), Accept all, "text changed" message | `src/components/editor/plugins/WritingAssistSidebarPlugin.tsx` |

### Discovery deliverables

- `docs/KAIPROOFREAD_KAIKEYS_AUDIT.md`: comparison of GitHub and local, verified vs unverified, defects.
- `docs/KAIPROOFREAD_KAIKEYS_FEATURE_MATRIX.md`
- `docs/KAIPROOFREAD_KAIKEYS_LOCAL_AUDIT.md`: how to run the Mac audit, and exactly which files are needed.
- `scripts/kai-local-audit.sh`: read-only local inventory.

`KAIPROOFREAD_KAIKEYS_ARCHITECTURE.md` and `KAIPROOFREAD_KAIKEYS_IMPLEMENTATION_PLAN.md`
are deliberately **not written yet**. Proposing an architecture before seeing the
local KaiProofread/KaiKeys code would risk duplicating it.

## Tests and builds run

| Check | Result |
|---|---|
| `npm test` (Vitest): 33 new tests in `writingAssist`, `writingAssistCore`, `suggestionOffsets`, `plainTextMap` | **207 / 207 pass** |
| New `plainTextMap` tests run against the **old** code | 5 of 6 fail, confirming they catch the defects |
| `npm run build` (tsc + Vite) | **Pass** |
| ESLint on changed files | Clean (repo-wide: 44 pre-existing problems, unchanged) |
| `deno check` on the edge function | **Pass** (Deno 2.9.6) |
| Edge function run locally under Deno, error paths | **Pass**: unauthorized 401, malformed 400, too long 413, missing key 503, whitespace 200; log contains codes only |
| Browser (Playwright, Chromium): consent card, offline-only notices, three sequential fixes after a leading blank line, online checks failing visibly | **Pass**, no page errors |
| `scripts/kai-local-audit.sh` on a cloud mock workspace: planted secrets, uncommitted files, local-only branch, folder name with a space | **Pass**: found all of them, 0 secrets in the report, 0 files modified, git indexes unchanged. ShellCheck clean |

**Not tested:**
- Live LanguageTool calls (host blocked here).
- A live Claude call (no API key here).
- The audit script on real macOS bash 3.2 / BSD tools.

## Known issues

- The edge function's default model is still `claude-sonnet-4-20250514`. If that
  model is retired, the function now returns a visible `not_configured` error
  instead of silently returning nothing. **Owner decision:** whether to switch
  the model (set `WRITING_ASSIST_MODEL`, or change the default).
- Repeated-word detection misses 1–2 letter words.
- The local rules are English-only regardless of the proofing locale.
- Edge function CORS is `*` (JWT still required).
- The consent choice and the personal dictionary are stored per device (localStorage), not per account.
- Readability scores use a heuristic syllable count (within about ±1 syllable per word) and English-only formulas.

## Work split

### Can be done in the cloud (no owner action)
- More KaiWriter engine work: syncing the personal dictionary across devices
  (needs a migration), usage storage and per-user quotas (needs a migration),
  AI rewrite / tone actions (live model calls can't be tested here).
- A Chromium / Firefox extension (build, load into headless Chromium, end-to-end
  tests), **once the local KaiBrowser code shows whether one exists**.
- Kotlin keyboard logic (autocorrect, prediction, dictionary) as plain JVM code
  with unit tests. Gradle and Java 21 are available here.
- Architecture and implementation plan, after the local audit.

### Needs your Mac
- Run `scripts/kai-local-audit.sh` and send the report.
- Push local-only work: KaiWriter proofreading files, KaiBrowser, KAIHUB_PHASE_BETA,
  any keyboard projects.
- Build and run the iOS / iPadOS keyboard extension and host app, and the Safari
  web extension (Xcode required).

### Needs physical devices
- KaiKeys on iPhone / iPad and on Android phones: typing latency, memory, battery,
  secure-field behaviour, host-app compatibility, keyboard switching.
- Extension behaviour on real sites in Chrome, Edge, Firefox and Safari.

### Needs your approval
- Changing the AI model or provider, and any paid API usage.
- Allowing `dl.google.com` in this environment's network settings (for the Android SDK).
- Creating new GitHub repositories (e.g. `KaiProofread`, `KaiKeys`, `KaiBrowser`).
- Applying database migrations (the PR #2 migration, and any usage-quota table).
- Browser-store and app-store developer accounts, submissions and publishing.
- Any change to how user text is shared between products.

## Blockers

1. Local workspace not visible: waiting for the audit report and the pushed branches.
2. Android SDK host blocked (`dl.google.com`).
3. No Xcode in the cloud (iOS keyboard and Safari extension).
