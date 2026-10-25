# KaiProofread + KaiKeys — progress

_Last updated: 2026-10-25._

## Current phase

**Phase 2 (core engine), cloud part, inside KaiWriter.** Phase 0's local side is still
waiting on the owner; no new products have been created.

## Phases 8 and 10 (KaiWriter part): privacy controls and release preparation

| Change | Files | Verified by |
|---|---|---|
| Download my data (JSON: documents with text and full content, history, folders, dictionary, settings, AI usage; no credentials or PIN hash), for guests too | `src/lib/accountData.ts`, Account dialog in `Modals.tsx` (loaded on demand) | 1 test (IndexedDB); production build in a browser: file downloaded and parsed |
| Delete account: edge function deletes the auth user (every KaiWriter table cascades); requires a sign-in in the last 15 minutes and typing DELETE; refused while a paid subscription is active; optionally clears this browser | `supabase/functions/delete-account/index.ts` (new), `_shared/accountCore.ts`, `accountData.ts`, `Modals.tsx` | 7 tests; `deno check`; function run under Deno against real PostgreSQL 16 with all migrations: refusals change nothing, deletion removes that user's rows in every table and leaves other users' rows, the old token stops working, log has codes only. Browser (app → real function → real Postgres, stand-in auth): button disabled until DELETE, account and rows gone, local copies kept when not ticked, signed out |
| Production-build smoke test | `vite preview` of `dist/` | live underlines, autosave across reload, PDF export (valid PDF), data download; no page errors or failed requests |
| Deployment runbook (order, secrets, smoke test, rollback), privacy and data-flow description, release notes | `docs/KAIWRITER_DEPLOYMENT.md`, `docs/KAIWRITER_PRIVACY_DATA_FLOW.md`, `docs/KAIWRITER_RELEASE_NOTES.md` | reviewed against the code |

**Not done here:** deploying to Vercel. This environment has no Vercel credentials or
connector, and no Vercel deployment statuses appear on the repo's commits. The runbook
covers deploying from the Mac CLI or through a Git integration.

Tests: **312 / 312 pass**; build passes; lint unchanged (44, all pre-existing).

## Phase 2 (continued): offline grammar, shortcuts, history retention

| Change | Files | Verified by |
|---|---|---|
| Offline English rules: a/an, agreement, could-of, than/then, its/it’s, punctuation and spacing, capitalisation, comma splices, likely fragments, inconsistent spellings; run-on hint on long unpunctuated sentences | `src/lib/grammarRules.ts` (new), `src/lib/writingAssist.ts` | 17 tests, each rule with errors it must catch and correct sentences it must leave alone; offsets checked; 35,000 characters in well under 500 ms. Real prose (GPL, Apache, GFDL, six READMEs, these docs; about 100,000 characters): no false alarms, after fixes. Browser: underlined live, fix cards apply |
| F7 and Alt/Option+F7 | `KeyboardShortcutsPlugin.tsx`, `EditorView.tsx`, ribbon tooltips | browser |
| Version history retention: limit, age for automatic snapshots, snapshots on/off, delete one / all | `src/lib/versionStore.ts`, Version History dialog in `Modals.tsx` | 6 tests (IndexedDB) |

Bugs found and fixed while doing this:
- The long-sentence warning pointed one character early after a space (wrong underline and jump-to).
- The Version History text said automatic snapshots happen every 15 minutes; they happen every 5.
- First drafts of the rules flagged correct writing. The corpus run and the tests caught: “a united front”, “an X-ray”, “a NATO member”, “the might of”, “in May of 2020”, “could of course”, “things were better then”, “your welcome pack”, “Part I is”, “however it turns out”, “Since 2010 we have grown”, “re-sign”/“resign”, two spaces after a full stop, and text inside URLs.

Tests: **304 / 304 pass**; build passes; lint unchanged (44, all pre-existing).

## Phase 2: AI rewriting, provider abstraction, usage limits

| Change | Files | Verified by |
|---|---|---|
| Provider-neutral completion: retries with bounded backoff, model fallback, time budget, tokens counted across attempts | `supabase/functions/_shared/aiProvider.ts` | 11 unit tests |
| Rewrite styles, prompt (injection-resistant, no invented facts, UK/US spelling), reply validation | `supabase/functions/_shared/rewriteCore.ts` | 11 unit tests |
| Daily limits per plan, plan detection, UTC day | `supabase/functions/_shared/aiUsageCore.ts` | 3 unit tests |
| Usage table + atomic `kaiwriter_ai_reserve` / `kaiwriter_ai_finish` (service role only) | `supabase/migrations/20261025130000_kaiwriter_ai_usage.sql` (new, **not applied**) | all 5 migrations applied in order to a real PostgreSQL 16 (with Supabase stand-in roles); limit, next day, limit 0, refund, token totals; RLS (own rows only, no writes); `anon`/`authenticated` can't call the functions; 30 concurrent reservations against a limit of 7 → exactly 7 |
| Edge function: verifies the user's token with Supabase (not just its presence), reserves quota, uses the provider layer, new `rewrite` mode, new errors `quota_exceeded` and `usage_unavailable`, returns remaining quota | `supabase/functions/writing-assist/index.ts` | `deno check`; run under Deno against stand-ins for Supabase auth and the Anthropic API, with usage counted in the real Postgres: fallback from a retired model, retries on overload then refund, free limit 3 → 4th refused, Pro not limited, 401/400/413, refusal 422, oversized and non-JSON replies 502, usage table missing 503, document text never in the log |
| Rewrite client, word diff, putting a rewrite into the document (plain or tracked) | `src/lib/aiRewrite.ts`, `src/lib/wordDiff.ts`, `src/components/editor/rewriteApply.ts` | 7 + 3 + 9 tests |
| Rewrite tab and Review ▸ Rewrite button | `src/components/editor/plugins/RewritePanel.tsx`, `WritingAssistSidebarPlugin.tsx`, `ReviewRibbon.tsx` | browser (app → real edge function → real Postgres; stand-in model): consent gate, diff, quota line, Replace + Undo, tracked Replace, “no changes”, Insert below, edited text refused, only the selection sent, no new external hosts, no page errors |

Tests: **279 / 279 pass**; build passes; lint unchanged (44, all pre-existing).

**Not tested:** a live Claude call (no API key here), and the migration on the real Supabase project.

**Behaviour change to note:** once this is deployed, every AI request (including
the existing AI suggestions) needs the usage migration. Without it the function
returns “not set up on this server yet” instead of calling the model.

**Owner decisions:** the daily limits (defaults free 25, Pro/Teams 500), whether to
set fallback models (`WRITING_ASSIST_FALLBACK_MODELS`, empty by default), and the
model itself (default unchanged).

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

## Personal dictionary synced across devices

| Change | Files | Verified by |
|---|---|---|
| Table `kaiwriter_dictionary_words`: one row per word, own-rows-only RLS, `updated_at` trigger, Realtime | `supabase/migrations/20261025120000_kaiwriter_personal_dictionary.sql` (new, **not applied**) | reviewed; not run against a database here |
| Per-word entries with modified time and removal tombstones; older word lists still load | `src/lib/personalDictionary.ts` | unit tests |
| Upload through the existing outbox (works offline, retried), incremental download, live updates from other devices, guest words carried into the account on sign-in | `src/lib/cloudSync.ts` | 5 tests: add/remove upload, remote add/remove applied, newer change wins across devices, newer local change kept over older cloud copy, pre-sign-in words uploaded |

Same word changed on two devices: the later change wins. Different words never
overwrite each other. Not shared with other Kai products.

Tests: **235 / 235 pass**; build passes; lint unchanged (44, all pre-existing).
**Not tested:** sync against a live Supabase project (the migration has to be applied first).

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
- The offline grammar rules are English-only (other languages get only the repeated-word check).
- Fragment and comma-splice detection are heuristics, not a parser.
- Edge function CORS is `*` (a valid sign-in is still required).
- `template-assist` (Kai Assist template filling) still calls the model directly, with no usage limit or consent step.
- The online-checks consent choice is stored per device (localStorage), not per account. (The personal dictionary now syncs for signed-in users.)
- Readability scores use a heuristic syllable count (within about ±1 syllable per word) and English-only formulas.

## Work split

### Can be done in the cloud (no owner action)
- More KaiWriter engine work: cost tracking (needs a price table), syncing history
  settings and consent per account.
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
- Deploying to Vercel and Supabase (see `docs/KAIWRITER_DEPLOYMENT.md`), including `delete-account`.
- Applying database migrations, in order: `20261015120000_kaiwriter_cross_device_sync.sql`,
  `20261025120000_kaiwriter_personal_dictionary.sql`, `20261025130000_kaiwriter_ai_usage.sql`.
- AI daily limits per plan, and any fallback models.
- Browser-store and app-store developer accounts, submissions and publishing.
- Any change to how user text is shared between products.

## Blockers

1. Local workspace not visible: waiting for the audit report and the pushed branches.
2. Android SDK host blocked (`dl.google.com`).
3. No Xcode in the cloud (iOS keyboard and Safari extension).
