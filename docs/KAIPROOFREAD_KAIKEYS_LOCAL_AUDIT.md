# Running the local audit on your Mac

The cloud session can't see `~/Developer/MPJL_APPS`. This script inventories
what's there so the audit can be completed without uploading the whole workspace.

## 1. What the script does and doesn't do

`scripts/kai-local-audit.sh` is **read-only**:

- It writes exactly one file: the report, which must be outside the workspace
  (by default `~/Desktop/kai-local-audit-<date>.md`).
- It creates, changes or deletes nothing in your projects. Git is queried with
  `--no-optional-locks`, so even `git status` won't refresh `.git/index`.
- It doesn't run builds or tests, and doesn't install anything.
- It never prints file contents. It only prints file names, line counts, git
  state, export and import names, package names, and extension permission lines.
- It skips `node_modules`, build output, `Pods`, `DerivedData`, `.git` and the
  like, and never opens `.env*`, keys, certificates, provisioning profiles,
  keystores, `GoogleService-Info.plist`, `google-services.json` or databases.
- Every printed line goes through a redactor for API keys, tokens, JWTs and
  credentials embedded in remote URLs.

It inspects `KaiWriter`, `KaiBrowser`, `KAIHUB`, `KAIHUB_PHASE_BETA` and
`KaiDocs Pro`, plus any folder up to three levels deep whose name contains
`proof`, `keys`, `keyboard` or `extension`. For each one it reports:

- git state: branches, commits that are on no remote, uncommitted files;
- browser-extension manifests (MV2/MV3, permissions, content scripts, Firefox
  settings), told apart from web-app manifests;
- iOS keyboard extensions, Swift `UIInputViewController`s, Android IMEs,
  Xcode and Expo projects, Tauri;
- proofreading, writing-assistance and keyboard source files and their tests;
- the two files named in the brief, with their imports.

The script was tested in the cloud on a copy of the GitHub repositories, with
planted secrets, uncommitted files, a local-only branch and a folder name
containing a space. It found all of them, redacted all of the secrets and modified
nothing. It was written for macOS's bash 3.2 and BSD tools, but **it has not yet
been run on a Mac**. If anything errors, send the error text.

## 2. Run it

From the KaiWriter repository, once this branch is on your Mac:

```bash
cd ~/Developer/MPJL_APPS/KaiWriter
git fetch origin claude/great-turing-ps5a2g
git show origin/claude/great-turing-ps5a2g:scripts/kai-local-audit.sh > ~/kai-local-audit.sh
bash ~/kai-local-audit.sh ~/Developer/MPJL_APPS
```

`git show … > ~/kai-local-audit.sh` copies the script to your home folder without
switching branches or touching your working copy. Read the script before running
it if you like; it's about 300 lines.

It prints `Report written to: …` when done. Open the report and check that you're
happy to share it.

## 3. What to send back

**Just the report file.** Attach it in this conversation, or commit it somewhere
private. It contains no file contents.

From the report, the cloud session will tell you exactly which files it needs,
which will be a short list like the one below. It will not ask for the whole
workspace.

## 4. Files needed to complete the audit

| Needed | Why | Best way to share |
|---|---|---|
| `KaiWriter/src/components/ui/PremiumProofreadingSettings.tsx` and the local files it imports | The brief's starting point for KaiProofread | Push your local KaiWriter work to a branch (below) |
| `KaiWriter/src/lib/__tests__/advancedProofreading.test.ts` and its subject files | Shows the intended behaviour of the local engine | Same branch |
| Any other KaiWriter file the report marks **untracked** or **modified** that is proofreading-related | Local-only work | Same branch |
| KaiBrowser: each extension `manifest.json` plus its extension source folder (background, content scripts, popup, options) and `package.json` | Existing extension implementation | A new private GitHub repo for KaiBrowser, or a branch if it already has git |
| `KAIHUB_PHASE_BETA`: `package.json` and the files the report lists under proofreading, keyboard or auth | Possible shared contracts | A private repo or branch |
| Any Xcode keyboard target or Android IME the report finds | Existing KaiKeys work | Push it to a repo |

### Pushing local KaiWriter work safely

```bash
cd ~/Developer/MPJL_APPS/KaiWriter
git status                       # check nothing secret is listed
git switch -c kaiproofread-local # new branch; your current branch is untouched
git add -A                       # .env.local is already excluded by .gitignore
git commit -m "Local KaiProofread work (unpushed)"
git push -u origin kaiproofread-local
```

For a folder that isn't a git repo yet (e.g. KaiBrowser), first check that it has
a `.gitignore` covering `node_modules`, build output and `.env*`. Then create a
**private** repo on GitHub and push it. Tell the session the repo name and it
will attach it.

## 5. Not needed

- Your whole workspace, `node_modules`, build output, `.env` files, keys,
  certificates or provisioning profiles.
- Credentials of any kind.
