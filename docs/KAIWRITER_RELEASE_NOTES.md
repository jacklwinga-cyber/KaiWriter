# KaiWriter release notes

## Unreleased (PR #2)

### New
- **Cloud sync across devices** that doesn't lose edits: offline changes are queued,
  conflicts keep both versions, and changes appear live on your other devices. Trash, pins,
  folders and page setup sync too.
- **Page layout:** page breaks (Ctrl/Cmd+Enter), page guides, page size (including Legal),
  orientation, margins, headers, footers and page numbers.
- **PDF export** with selectable text, headers, footers and "Page X of Y".
- **Open Word (.docx), text and HTML files.**
- **Track changes** with accept/reject, exported to Word as real revisions.
- **Proofreading:**
  - live checking as you type (offline);
  - a personal dictionary that syncs across devices;
  - UK/US spelling consistency and readability scores;
  - offline grammar checks (a/an, agreement, "could of", than/then, its/it's, punctuation, capitals, comma splices, inconsistent spellings);
  - Accept all.
- **AI rewriting** of a selection: improve, more professional, more friendly, shorten,
  simplify, expand, summarise. You see a comparison before anything changes, and it works
  with track changes. It needs your consent and counts against a daily allowance.
- **Shortcuts:** F7 for Spelling & Grammar, Alt/Option+F7 for Rewrite.
- **Your data:** download everything as a file, choose how long version history is kept,
  and delete your account.

### Fixed
- Newer edits from another device were ignored, and a false "Unsaved content recovered" banner appeared.
- Proofreading fixes landed one character off in documents starting with a blank line.
- Online checks failed silently.
- Saving dropped a document's pin and folder.
- Opening a document moved it to the top of Recents.
- Word export dropped the text of links.

### Before upgrading
See `docs/KAIWRITER_DEPLOYMENT.md`: apply the three database migrations before deploying
the web app and edge functions.
