# KaiWriter: deploying this release

_Covers PR #2 (`claude/great-turing-ps5a2g`). Last updated: 2026-10-25._

Production: `https://kaiwriter.kainoter.com` (Vercel, static Vite build: `vercel.json`).
Backend: Supabase (database, auth, edge functions).

**Do the steps in order.** The new web app expects the new database tables. If the web
app goes live first, signed-in users see "Sync failed" until the migrations are applied.
Nothing is lost (changes wait in each device's queue), but nothing syncs.

## 0. Before you start

- [ ] CI is green on the commit you're deploying (GitHub ▸ PR #2 ▸ Checks).
- [ ] You have the Supabase CLI linked to the production project (`supabase link`).
- [ ] You have access to the Vercel project for kaiwriter.kainoter.com.
- [ ] Optional but recommended: take a database backup (Supabase ▸ Database ▸ Backups).

## 1. Database migrations

All three are **additive**: they add tables, columns, functions and policies, and they
don't change or remove existing data.

```bash
supabase db push
```

This applies, in order:

| Migration | Adds |
|---|---|
| `20261015120000_kaiwriter_cross_device_sync.sql` | Document sync columns (incl. `page_setup`, `deleted_at`, `pinned`, `folder_id`), `kaiwriter_folders`, the `updated_at` trigger, Realtime |
| `20261025120000_kaiwriter_personal_dictionary.sql` | `kaiwriter_dictionary_words` |
| `20261025130000_kaiwriter_ai_usage.sql` | `kaiwriter_ai_usage`, `kaiwriter_ai_reserve`, `kaiwriter_ai_finish` (service role only) |

Check: Supabase ▸ Table Editor shows `kaiwriter_folders`, `kaiwriter_dictionary_words`
and `kaiwriter_ai_usage`.

## 2. Edge functions

```bash
supabase functions deploy writing-assist
supabase functions deploy delete-account
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by
Supabase automatically. Secrets (Supabase ▸ Edge Functions ▸ Secrets), all optional except
the API key:

| Secret | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI suggestions and rewriting | none: AI shows "not set up on this server yet" |
| `WRITING_ASSIST_MODEL` | Model | `claude-sonnet-4-20250514` (unchanged) |
| `WRITING_ASSIST_FALLBACK_MODELS` | Comma-separated models to try if the first is unavailable | none |
| `WRITING_ASSIST_DAILY_LIMIT_FREE` / `_PRO` / `_TEAMS` | AI requests per user per UTC day; `0` turns AI off for that plan | 25 / 500 / 500 |

Once deployed, `writing-assist` needs the usage migration (step 1). Without it, every AI
request returns "not set up on this server yet".

## 3. Web app (Vercel)

No new environment variables. The existing ones are still needed in Vercel ▸ Settings ▸
Environment Variables (Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_SITE_URL`, `VITE_STRIPE_PUBLISHABLE_KEY` (and optionally `VITE_KAIWRITER_URL`,
`VITE_KAIHUB_URL`).

Deploy one of two ways:

- **Git integration** (if the Vercel project is connected to this repo): merge PR #2 into the
  production branch set in Vercel ▸ Settings ▸ Git. Vercel builds and deploys it.
  (As of this writing no Vercel deployment statuses appear on the repo's commits, so it may
  not be connected.)
- **CLI** from a checkout of the release commit:
  ```bash
  npm ci
  npm test
  vercel          # preview deployment first
  vercel --prod   # then production
  ```

Try the preview URL (checklist below) before promoting to production.

## 4. Smoke test (preview first, then production)

- [ ] The dashboard loads, and you can create a document, type, and reload with the text still there.
- [ ] Signed in: the status bar shows the document as synced. Open it in a second browser, edit it, and the first shows the change.
- [ ] Review ▸ Live Check underlines "He don't know"; clicking shows a fix.
- [ ] Review ▸ Spelling & Grammar (F7) runs; with online checks allowed, the "AI suggestions" notice doesn't say "not set up".
- [ ] Select a sentence ▸ Review ▸ Rewrite ▸ Shorten shows a comparison, and Replace works.
- [ ] File ▸ Export as PDF downloads a PDF with page numbers.
- [ ] Account ▸ Download my data downloads a .json file.
- [ ] Optional, with a test account only: Account ▸ Delete account… deletes it (sign in fresh first).

## 5. Rolling back

| Part | How | Notes |
|---|---|---|
| Web app | Vercel ▸ Deployments ▸ previous production deployment ▸ **Promote** (Instant Rollback) | Safe: the migrations are additive, and the old app works with the new tables |
| `writing-assist` | `git checkout develop -- supabase/functions && supabase functions deploy writing-assist` | The old function ignores rewrite requests (the new app then shows "unreadable result") |
| `delete-account` | `supabase functions delete delete-account` | The app then shows "could not be deleted. Nothing was removed." |
| Migrations | Normally leave them in place | Dropping the new tables deletes synced folders, dictionary words and AI usage. Only do this deliberately, from a backup plan |

## Known limitations of this release

- Not yet run against the real Supabase project: sync, dictionary sync, usage limits and
  account deletion were tested against a real PostgreSQL 16 and stand-ins for Supabase
  auth. Live Claude and LanguageTool calls were not tested from the build environment.
- Version history, the online-checks consent and track-changes on/off are per device.
- The offline grammar rules are English-only.
- `template-assist` (Kai Assist template filling) still calls the model directly, with no daily limit or consent step.
- An old app version (for example the desktop app before updating) shows a permanently
  deleted document as a blank, untitled document.
