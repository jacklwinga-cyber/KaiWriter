# KaiWriter: what data goes where

_Describes the code in this repository as of 2026-10-25. Use it to write or check the public
privacy policy. It is not itself a legal policy._

## Summary

- **Guests and PIN profiles:** everything stays in the browser (IndexedDB and localStorage).
  Nothing is sent anywhere unless you allow online checks.
- **Cloud accounts:** documents, folders, comments and the personal dictionary sync to the
  KaiWriter Supabase project, readable only by the account (row-level security).
- **Online checks are opt-in.** They send only the text being checked, and only after the
  user allows them in the Review panel.
- **Live checking (as you type) never leaves the device.**

## Data stored

| Data | Where | Who can read it | Kept until |
|---|---|---|---|
| Documents, folders | Browser (IndexedDB); cloud accounts also `kaiwriter_documents`, `kaiwriter_folders` | The account (RLS) | Deleted by the user. Trash is a soft delete; "Delete permanently" leaves a small tombstone (id, no content) so other devices remove it too |
| Comments | Browser; cloud `kaiwriter_comments` | The account | Deleted with the document or account |
| Version history | **Browser only** | This browser | The History settings limit (default 50 per document) or the user deletes it |
| Personal dictionary | Browser; cloud `kaiwriter_dictionary_words` | The account | Removed by the user (removals sync as tombstones) |
| AI usage (requests and tokens per UTC day, **no text**) | Cloud `kaiwriter_ai_usage` | The account can read; only the server can write | Account deletion |
| Subscription state | Cloud `kaiwriter_subscriptions` (written by the Stripe webhook) | The account | Account deletion. Stripe keeps its own billing records |
| Preferences, consent choice, track-changes switch | Browser (localStorage) | This browser | Cleared with site data |
| PIN | Browser: a salted hash, never the PIN itself | This browser | "Clear profile" |

## Data sent to other services

| When | What is sent | To | Notes |
|---|---|---|---|
| Spelling & Grammar, after consent | The document or selected text (≤ 20,000 characters) and language | LanguageTool public API (`api.languagetool.org`) | The text leaves KaiWriter's systems. LanguageTool's own privacy terms apply |
| AI suggestions, after consent, signed in | The document or selected text (≤ 20,000 characters) | KaiWriter edge function `writing-assist`, then Anthropic | The function logs error codes only, never text. Counted against the daily limit |
| Rewrite, after consent, signed in | **Only the selected text** (≤ 6,000 characters), style and language | Same | Nothing changes in the document until the user clicks Replace or Insert |
| Kai Assist (template filling) | A brief and up to 4,000 characters of the document | `template-assist`, then Anthropic | **No consent step or daily limit yet.** See Known gaps |
| Live checking | Nothing | n/a | Runs on the device |
| Sign-in | Email (one-time code) or a Google OAuth exchange | Supabase Auth (and Google) | |
| Billing | Handled on Stripe-hosted pages | Stripe | KaiWriter stores the plan and status only |
| Fonts | A font request (IP address, user agent) | Google Fonts | Could be self-hosted to avoid this |

## User controls

- **Online checks:** allow or deny in the Review panel; "Offline only" keeps everything on the device.
- **Live checking:** Review ▸ Live Check on or off.
- **Version history:** Version History ▸ History settings (limit, age, automatic snapshots on or off; delete one or all).
- **Download my data:** Account ▸ Your data. A JSON file with every document stored in this
  browser (text and full content), their history, folders, dictionary, settings and, for
  cloud accounts, AI usage. It includes no credentials or PIN hash.
- **Delete account:** Account ▸ Delete account… (cloud accounts).
  - Deletes the Supabase user, which deletes all their rows in every KaiWriter table (`ON DELETE CASCADE`).
  - Needs a sign-in in the last 15 minutes, and typing DELETE.
  - Refused while a paid subscription is active.
  - Optionally clears this browser too.

## Known gaps

- `template-assist` has no consent step, daily limit or sign-in check beyond the Supabase gateway.
- The consent choice and version history are per browser, not per account.
- Google Fonts is loaded from Google's servers.
- Edge function CORS allows any origin (a valid sign-in is still required).
