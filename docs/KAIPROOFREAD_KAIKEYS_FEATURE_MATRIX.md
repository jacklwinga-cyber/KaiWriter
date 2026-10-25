# KaiProofread + KaiKeys — feature matrix

_Last updated: 2026-10-25 (Phase 1 cloud work: dictionary, UK/US spelling, readability, inline highlights)._

Statuses:
- **Working**: implemented and passing tests in this session.
- **Partially Working**: implemented with known gaps.
- **Broken**: implemented but fails.
- **Missing**: verified absent from the GitHub code listed in the audit.
- **Not Verified**: can't be judged without the local Mac workspace or a device.

"Missing" applies only to the GitHub code. Each such row could flip once the local
audit is in (`scripts/kai-local-audit.sh`).

## KaiProofread (evidence: KaiWriter on GitHub)

| Feature | Status | Evidence / notes |
|---|---|---|
| Spelling and grammar checking | **Working** with recorded responses; live service **Not Verified** | `writingAssist.ts` → LanguageTool. Tested in `writingAssist.test.ts`. LanguageTool is unreachable from the cloud session |
| Punctuation | Same as above | LanguageTool PUNCTUATION category |
| Clarity / conciseness | **Working** | Local rules: wordy phrases, long sentences, repeated words. Tested |
| Passive voice hints | **Working** | Local rule, capped at 3 per check |
| Repeated words | **Working** | Any length, any language; "had had" / "that that" / "is is" allowed. Tested |
| AI style and clarity suggestions | **Working** except the live model call; that call is **Not Verified** | Edge function error paths run and tested under Deno; the model reply is validated and re-anchored (tested). No API key in the cloud |
| Explicit error states | **Working** | Each checker reports ok / skipped (with a reason) / error (with a message). The edge function returns coded errors. Tested; browser-checked |
| Prompt-injection protection | **Working** (mitigation) | Document wrapped in `<document>` with the closing tag neutralised; system prompt treats it as data. Tested |
| Consent before sending text online | **Working** | One-time choice in the Review panel; without it only offline checks run. Browser-checked |
| Timeouts / retries / cancellation | **Working** | 15 s LanguageTool, 30 s AI (25 s plus 1 retry server-side), 1 retry on server errors, stale checks aborted. Tested |
| Suggestion offsets / overlapping edits | **Working** | Positions verified before each edit; remaining suggestions shifted; overlaps dropped. Tested (`suggestionOffsets`, `plainTextMap`) |
| Accept / dismiss suggestion | **Working** | Browser-checked: three sequential fixes after a leading blank line |
| Accept all | **Working** | Grammar tab; conflict-free subset applied in one undo step. Tested |
| Undo / redo of fixes | **Working** | Lexical history. Accept all is one step |
| Formatting preservation | **Working** | Replacement keeps the first text node's formatting across node boundaries. Tested |
| Selection-based checking | **Working** | Selection offsets now mapped into document positions |
| UK / US English | **Working** | Offline: about 80 unambiguous US/UK spelling pairs, case-preserving, for en-GB/AU/NZ/ZA/IE and en-US (en-CA left alone); meaning-dependent pairs and -ize/-ise excluded. Online: locale passed to LanguageTool. Tested; browser-checked |
| Multilingual proofreading | **Partially Working** | 10 locales via LanguageTool. English-only local rules are now skipped for other languages (only repeated words run). AI is English-only |
| Personal dictionary / ignore word | **Working** (per device) | "Add to dictionary" on spelling issues; list with remove; filters spelling issues from every checker; case- and apostrophe-insensitive. Stored per user in localStorage, **not yet synced across devices**. Tested; browser-checked |
| Inline highlights | **Working** | CSS Custom Highlight API (Chrome/Edge 105+, Safari 17.2+, Firefox 140+): wavy red for errors, dotted blue for style. No document or DOM changes; stale issues aren't underlined; cleared when the panel closes. Browser-checked |
| Live (as-you-type) proofreading | **Missing** | Checks run on demand |
| Tone adjustment, rewrite, shorten, expand, summarise | **Missing** in KaiWriter (KaiDocs Pro's `rewrite.ts` is unrelated PDF editing) | |
| Readability score / writing statistics | **Working** (English) | Flesch Reading Ease and band, Flesch–Kincaid grade, words, sentences, words per sentence, long sentences, reading time; shown on the Suggestions tab; hidden for non-English. Tested; browser-checked |
| AI provider abstraction / model fallback | **Partially Working** | Model configurable via `WRITING_ASSIST_MODEL`; single provider; no fallback chain |
| Usage limits / token and cost tracking | **Partially Working** | Input cap of 20,000 characters; token usage returned but not stored; no per-user quota |
| `PremiumProofreadingSettings.tsx` | **Not Verified** | Local only |
| `advancedProofreading.test.ts` | **Not Verified** | Local only |
| Desktop app integration | **Not Verified** | Tauri shell exists; desktop build not run in this session |

## KaiProofread browser extensions

| Feature | Status | Evidence / notes |
|---|---|---|
| Chromium (Chrome / Edge) extension | **Not Verified** | No manifest in any GitHub repo; KaiBrowser is local-only |
| Firefox extension | **Not Verified** | Same |
| Safari web extension | **Not Verified** | Same; needs macOS / Xcode to build |
| Text-field / contenteditable detection, popovers, site exclusions | **Not Verified** | |

## KaiKeys

| Feature | Status | Evidence / notes |
|---|---|---|
| iOS / iPadOS keyboard extension | **Not Verified** | No Xcode project or `com.apple.keyboard-service` plist in any GitHub repo. KAIHUB mobile is Expo without a keyboard target |
| Android input method (IME) | **Not Verified** | No `InputMethodService` in any GitHub repo |
| Typing fundamentals (keys, shift, delete, layouts) | **Not Verified** | |
| Autocorrection / prediction / dictionary | **Not Verified** | |
| KaiProofread integration in the keyboard | **Not Verified** | |
| Themes, accessibility, onboarding, privacy settings | **Not Verified** | |

## Ecosystem

| Feature | Status | Evidence / notes |
|---|---|---|
| Shared account identity | **Partially Working** | KaiWriter and KAIHUB both use Supabase auth; whether they share one Supabase project is not visible in code (it's set by env vars) |
| Shared writing preferences / dictionaries | **Missing** | |
| Subscription entitlements | **Partially Working** | KaiWriter has Stripe Pro via `kaiwriter_subscriptions`; not shared with other products |
| KAIHUB_PHASE_BETA contracts | **Not Verified** | Local only |
