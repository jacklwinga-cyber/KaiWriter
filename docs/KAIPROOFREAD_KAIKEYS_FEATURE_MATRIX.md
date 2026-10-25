# KaiProofread + KaiKeys — feature matrix

_Last updated: 2026-10-25 (Phase 2 cloud work: AI rewriting and comparison, model fallback, usage limits; offline grammar rules, keyboard shortcuts, history retention)._

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
| Offline grammar (articles, agreement, common confusions) | **Working** (English) | `grammarRules.ts`: a/an by sound (“an hour”, “a university”, “an HR team”), pronoun–verb agreement (“he don’t”, “they was”, “I is”), could/should/would/must “of”, than/then, its/it’s, your welcome, alot. Tuned for precision: questions, modals, subjunctives, numerals (“Part I is”) and other meanings (“the might of”, “better then.”) are left alone. 0 false alarms on about 100,000 characters of real prose (licences, READMEs, these docs). Tested; live and in the panel; browser-checked |
| Offline punctuation and capitalisation | **Working** (English) | Space before punctuation, missing space after it, doubled commas/stops (not ellipses or paths), extra spaces (not two after a full stop), lower-case “i”, sentences starting lower-case (not after e.g., i.e., p.m. and so on). URLs, emails and paths are skipped. Tested |
| Sentence fragments, run-ons, comma splices | **Partially Working** (heuristics) | Comma splice before therefore/moreover/consequently/nevertheless/furthermore, and before “however” plus a pronoun (not “however it turns out”). Likely fragments: short sentences starting with Because/Although/Though/Whereas/Even though with no main clause. Long sentences with no commas get a run-on hint. No full parser, so many cases are missed. Tested |
| Inconsistent terminology | **Working** | Flags the less common spelling when a document mixes forms: email/e-mail, online/on-line, website/web site, okay/OK, toward/towards, and any word written both hyphenated and closed up (“follow-up”/“followup”; not re-/co- words like “re-sign”/“resign”). Tested |
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
| Personal dictionary / ignore word | **Working**; cross-device sync **Working** against a test double, live Supabase **Not Verified** | "Add to dictionary" on spelling issues; list with remove; filters spelling issues from every checker; case- and apostrophe-insensitive. Signed-in users: synced across devices word by word (table `kaiwriter_dictionary_words`, migration `20261025120000`), works offline through the sync outbox, removals sync as tombstones, the later change to the same word wins, words added before signing in are carried into the account. Guests: per device. Tested (5 sync tests); live sync needs the migration applied |
| Inline highlights | **Working** | CSS Custom Highlight API (Chrome/Edge 105+, Safari 17.2+, Firefox 140+): wavy red for errors, dotted blue for style. No document or DOM changes; stale issues aren't underlined; cleared when the panel closes. Browser-checked |
| Live (as-you-type) proofreading | **Working** (offline checks) | Runs 500 ms after typing stops: UK/US spelling, repeated words, wordiness, passive voice, personal dictionary. **Nothing leaves the device** (browser test: no requests other than the app's existing font loading). Clicking an underline opens a card: fix / Ignore / Add to dictionary, Escape closes. Review ▸ Live Check on/off (default on, remembered). Paused while the Review panel is open. Online checks stay manual (privacy and LanguageTool rate limits). Tested; browser-checked |
| Typing performance with underlines | **Working** | Underlines painted only near the visible area and repainted on scroll and after a pause. 30,000-character document: realistic text median keystroke 21 ms (vs 23 ms off); worst case (5 issues per sentence) 45 ms (vs 19 ms off). Headless Chromium on a cloud VM, not a real device |
| Tone adjustment, rewrite, shorten, expand, simplify, summarise | **Working** against a stand-in model; live model **Not Verified** | Review ▸ Rewrite (or the Rewrite tab): Improve, More professional, More friendly, Shorten, Simplify, Expand, Summarise. Sends **only the selected text** (max 6,000 characters), only after consent. Prompt forbids invented facts; document wrapped as data. Reply validated (JSON, length plausible for the style, one paragraph stays one paragraph). Tested (unit tests; real edge function run under Deno with stand-ins; browser) |
| Selection-based rewriting | **Working** (same caveat) | Replace, Insert below, Copy, Try again, Discard. Replace re-checks that the text is unchanged first and is one undo step; with Track Changes on it's recorded as a tracked deletion + insertion. Browser-checked |
| Original-versus-revised comparison | **Working** | Word-level diff (insertions/deletions highlighted, word counts) before anything changes. Tested; browser-checked |
| Keyboard shortcuts | **Working** | F7: Spelling & Grammar (as in Word). Alt/Option+F7: Rewrite. Ctrl/⌘+F: Find. Browser-checked |
| Writing history with user-controlled retention | **Working** (per device) | Version History: delete one version or all of a document's; History settings: keep 10/25/50/100 versions, delete automatic snapshots after 7–365 days or never, automatic snapshots on/off. Versions you save are kept until deleted or over the limit. Defaults unchanged (50, kept). Tested; the dialog was not opened in a browser (it's a Pro feature) |
| Readability score / writing statistics | **Working** (English) | Flesch Reading Ease and band, Flesch–Kincaid grade, words, sentences, words per sentence, long sentences, reading time; shown on the Suggestions tab; hidden for non-English. Tested; browser-checked |
| AI provider abstraction / model fallback | **Working** (one provider) | `_shared/aiProvider.ts`: provider interface, bounded exponential backoff, fallback through `WRITING_ASSIST_FALLBACK_MODELS` on retired/overloaded/timeout, a 26 s total budget, no fallback on refusals or credential errors. Only an Anthropic adapter exists. Tested; run under Deno with a stand-in API |
| Usage limits / token and cost tracking | **Working** against a real Postgres 16; live Supabase **Not Verified** | Daily request limit per plan (defaults: free 25, Pro/Teams 500; `WRITING_ASSIST_DAILY_LIMIT_*`), counted atomically (30 concurrent requests against a limit of 7 → exactly 7 allowed), tokens stored per user per day, requests refunded when the provider did no work. Users can read only their own usage; only the edge function can change it. Shown as “N of M AI requests left today”. Cost in money is not computed (needs a price table) |
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
| Shared writing preferences / dictionaries | **Partially Working** | KaiWriter's personal dictionary syncs across a user's devices; not shared with other products yet |
| Subscription entitlements | **Partially Working** | KaiWriter has Stripe Pro via `kaiwriter_subscriptions`; not shared with other products |
| KAIHUB_PHASE_BETA contracts | **Not Verified** | Local only |
