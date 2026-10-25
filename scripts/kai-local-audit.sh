#!/usr/bin/env bash
# kai-local-audit.sh — read-only inventory of proofreading, keyboard and
# browser-extension work across the Kai projects on this Mac.
#
#   bash kai-local-audit.sh [WORKSPACE] [REPORT_FILE]
#
#   WORKSPACE    default: ~/Developer/MPJL_APPS
#   REPORT_FILE  default: ~/Desktop/kai-local-audit-<date>.md (must be outside WORKSPACE)
#
# Guarantees:
#   * Never creates, changes or deletes anything inside WORKSPACE. The only file
#     written is REPORT_FILE. Git is queried with --no-optional-locks so even
#     `git status` doesn't refresh .git/index.
#   * Never prints file contents except: package names, export/import names,
#     extension-manifest permission lines and test counts. Every printed line is
#     passed through a secret redactor.
#   * Skips dependency/build directories and secret-bearing files (.env*, keys,
#     certificates, provisioning profiles, keystores, databases).
#
# Works with macOS's bash 3.2 and BSD find/grep/sed. Takes a few minutes on a
# large workspace.

set -u
set -o pipefail
set -f   # no filename expansion: patterns below are passed to find/grep as-is
export LC_ALL=C

WORKSPACE="${1:-$HOME/Developer/MPJL_APPS}"
DEFAULT_REPORT="$HOME/Desktop/kai-local-audit-$(date +%Y%m%d-%H%M%S).md"
[ -d "$HOME/Desktop" ] || DEFAULT_REPORT="$HOME/kai-local-audit-$(date +%Y%m%d-%H%M%S).md"
REPORT="${2:-$DEFAULT_REPORT}"

if [ ! -d "$WORKSPACE" ]; then
  echo "Workspace not found: $WORKSPACE" >&2
  exit 1
fi
WORKSPACE="$(cd "$WORKSPACE" && pwd -P)"
REPORT_DIR="$(cd "$(dirname "$REPORT")" 2>/dev/null && pwd -P)" || { echo "Report folder doesn't exist: $(dirname "$REPORT")" >&2; exit 1; }
case "$REPORT_DIR/" in
  "$WORKSPACE"/*) echo "Choose a report location outside the workspace (it must not be modified)." >&2; exit 1 ;;
esac
REPORT="$REPORT_DIR/$(basename "$REPORT")"

PRUNE_DIRS="node_modules .git dist build out .next .turbo .expo .vercel .netlify coverage target Pods DerivedData .gradle .idea .vscode .venv venv __pycache__ .cache .parcel-cache .svelte-kit vendor .yarn .pnpm-store xcuserdata .swiftpm .build Carthage"
SKIP_FILES='-name .env -o -name .env.* -o -name *.pem -o -name *.key -o -name *.p8 -o -name *.p12 -o -name *.pfx -o -name *.cer -o -name *.mobileprovision -o -name *.keystore -o -name *.jks -o -name id_rsa* -o -name id_ed25519* -o -name *.sqlite -o -name *.sqlite3 -o -name *.db -o -name GoogleService-Info.plist -o -name google-services.json -o -name *.lock -o -name package-lock.json -o -name *.map -o -name *.min.js'
SOURCE_EXT='-name *.ts -o -name *.tsx -o -name *.js -o -name *.jsx -o -name *.mjs -o -name *.cjs -o -name *.json -o -name *.md -o -name *.swift -o -name *.m -o -name *.h -o -name *.kt -o -name *.java -o -name *.xml -o -name *.plist -o -name *.rs -o -name *.toml -o -name *.html -o -name *.css -o -name *.sql -o -name *.yml -o -name *.yaml -o -name *.gradle -o -name *.kts -o -name *.entitlements -o -name *.pbxproj'

# Proofreading / text-assistance / keyboard / extension vocabulary, matched in file contents.
FEATURE_RE='proofread|grammar|spellcheck|spell-check|spelling|languagetool|autocorrect|auto-correct|predictive|next-?word|paraphras|readability|rewrite(Text|Selection|Paragraph|Tone)|kaiproofread|kai-proofread|kaikeys|kai-keys|UIInputViewController|InputMethodService|textDocumentProxy|content_scripts|chrome\.runtime|browser\.runtime|webextension'
# …and in file names (broader, since names are short and specific).
NAME_MATCH='-iname *proof* -o -iname *grammar* -o -iname *spell* -o -iname *keyboard* -o -iname *kaikeys* -o -iname *autocorrect* -o -iname *predict* -o -iname *rewrite* -o -iname *writingassist* -o -iname *tone*'

redact() {
  sed -E \
    -e 's/sk-[A-Za-z0-9_-]{8,}/[REDACTED]/g' \
    -e 's/(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{10,}/[REDACTED]/g' \
    -e 's/xox[abposr]-[A-Za-z0-9-]{8,}/[REDACTED]/g' \
    -e 's/AKIA[0-9A-Z]{12,}/[REDACTED]/g' \
    -e 's/AIza[0-9A-Za-z_-]{20,}/[REDACTED]/g' \
    -e 's/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/[REDACTED-JWT]/g' \
    -e 's/(whsec|rk_live|rk_test|pk_live|sk_live|sk_test)_[A-Za-z0-9]{8,}/[REDACTED]/g' \
    -e 's/-----BEGIN [A-Z ]*-----.*/[REDACTED-KEY]/g' \
    -e 's/[A-Za-z0-9+_=-]{40,}/[REDACTED-LONG-TOKEN]/g' \
    -e 's#(https?://)[^/@ ]+@#\1#g'
}

out() { printf '%s\n' "$*" | redact >> "$REPORT"; }

# find wrapper: prune dependency/build dirs, skip secret files, print NUL-separated.
find_files() { # dir, extra find predicate…
  local dir="$1"; shift
  local prune="" name
  for name in $PRUNE_DIRS; do prune="$prune -name $name -o"; done
  prune="${prune% -o}"
  # shellcheck disable=SC2086
  find "$dir" \( -type d \( $prune \) -prune \) -o \( -type f ! \( $SKIP_FILES \) -size -1024k "$@" -print0 \) 2>/dev/null
}

# Source files whose contents or names match the feature vocabulary (NUL-separated, unique).
feature_files() {
  { find_files "$1" \( $SOURCE_EXT \) | xargs -0 grep -l --null -I -i -E "$FEATURE_RE" 2>/dev/null
    find_files "$1" \( $SOURCE_EXT \) \( $NAME_MATCH \)
  } | tr '\0' '\n' | sort -u | tr '\n' '\0'
}

rel() { printf '%s' "${1#"$WORKSPACE"/}"; }

GIT_CUR=""
g() { git --no-optional-locks -C "$GIT_CUR" "$@"; }

git_info() {
  local dir="$1"
  GIT_CUR="$dir"
  if ! git --no-optional-locks -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    out "- Git: **not a git repository** (nothing here can be on GitHub)"
    return
  fi
  local top; top="$(git --no-optional-locks -C "$dir" rev-parse --show-toplevel 2>/dev/null)"
  [ "$top" != "$dir" ] && out "- Git: inside repository \`$(rel "$top")\`"
  out "- Remote: \`$(g remote get-url origin 2>/dev/null || echo none)\`"
  out "- Current branch: \`$(g rev-parse --abbrev-ref HEAD 2>/dev/null)\` at \`$(g log -1 --format='%h %cs %s' 2>/dev/null | cut -c1-100)\`"
  out "- Local branches (upstream, ahead/behind):"
  g for-each-ref --format='%(refname:short) | %(upstream:short) | %(upstream:track)' refs/heads 2>/dev/null \
    | while IFS= read -r line; do out "  - $line"; done
  local unpushed
  unpushed="$(g log --branches --not --remotes --oneline 2>/dev/null | wc -l | tr -d ' ')"
  out "- Commits on local branches that are on no remote: **$unpushed**"
  local changes; changes="$(g status --porcelain=v1 --untracked-files=all 2>/dev/null)"
  if [ -z "$changes" ]; then
    out "- Uncommitted changes: none"
  else
    out "- Uncommitted changes: **$(printf '%s\n' "$changes" | wc -l | tr -d ' ') files** (names only; status M=modified, ??=untracked):"
    printf '%s\n' "$changes" | grep -v -E '(^|/)\.env|\.(pem|key|p8|p12|mobileprovision|keystore|jks)$' \
      | grep -v -E '/(node_modules|dist|build|\.next|target|Pods|DerivedData)/' | head -200 \
      | while IFS= read -r line; do out "  - \`$line\`"; done
  fi
}

file_state() { # git state of one file: tracked-clean / modified / untracked / not-in-git
  local f="$1" d; d="$(dirname "$f")"
  if ! git --no-optional-locks -C "$d" rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo "not in git"; return; fi
  local s; s="$(git --no-optional-locks -C "$d" status --porcelain=v1 -- "$(basename "$f")" 2>/dev/null | cut -c1-2)"
  case "$s" in
    "??") echo "untracked (never committed)" ;;
    "") if git --no-optional-locks -C "$d" ls-files --error-unmatch -- "$(basename "$f")" >/dev/null 2>&1; then
          local when; when="$(git --no-optional-locks -C "$d" log -1 --format=%cs -- "$(basename "$f")" 2>/dev/null)"
          echo "committed ${when:-}"
        else echo "ignored by .gitignore"; fi ;;
    *) echo "modified, not committed ($s)" ;;
  esac
}

exports_of() { # export names only, no bodies
  grep -E -o '^export (default )?(async )?(function|const|class|interface|type|enum) [A-Za-z0-9_]+' "$1" 2>/dev/null \
    | sed -E 's/^export (default )?(async )?//' | head -25 | tr '\n' ',' | sed 's/,$//; s/,/, /g'
}

imports_of() {
  grep -E -o "from ['\"][^'\"]+['\"]" "$1" 2>/dev/null | sed -E "s/from ['\"]//; s/['\"]$//" | sort -u | head -40 | tr '\n' ' '
}

audit_project() {
  local dir="$1"
  out ""
  out "## $(rel "$dir")"
  out ""
  git_info "$dir"

  if [ -f "$dir/package.json" ]; then
    out "- package.json: $(grep -E -m2 '"(name|version)"' "$dir/package.json" | tr -d ' \n' | cut -c1-120)"
    out "  - scripts: $(sed -n '/"scripts"/,/}/p' "$dir/package.json" | grep -E -o '"[a-zA-Z0-9:_-]+":' | tr -d '":' | tr '\n' ' ' | cut -c1-400)"
    out "  - relevant dependencies: $(grep -E -o '"(@lexical/[a-z-]+|lexical|languagetool[a-z-]*|nspell|hunspell[a-z-]*|dictionary-[a-z-]+|@anthropic-ai/sdk|openai|@tauri-apps/[a-z-]+|expo|react-native[a-z-]*|webextension-polyfill|wxt|plasmo|@crxjs/[a-z-]+|@types/chrome|@types/firefox-webext-browser|electron)": *"[^"]+"' "$dir/package.json" | tr -d ' ' | tr '\n' ' ')"
  fi

  # Browser-extension manifests (web-app manifests are reported separately).
  local m found_ext=0
  out ""
  out "### Browser extensions"
  while IFS= read -r -d '' m; do
    if grep -q '"manifest_version"' "$m" 2>/dev/null; then
      found_ext=1
      out "- \`$(rel "$m")\` — manifest_version $(grep -E -o '"manifest_version" *: *[0-9]+' "$m" | grep -E -o '[0-9]+$') — $(file_state "$m")"
      grep -E -o '"(name|version|default_locale)" *: *"[^"]*"' "$m" | head -3 | while IFS= read -r l; do out "  - $l"; done
      for key in permissions host_permissions optional_permissions; do
        local v; v="$(tr -d '\n' < "$m" | grep -E -o "\"$key\" *: *\[[^]]*\]" | head -1)"
        [ -n "$v" ] && out "  - $v"
      done
      grep -E -q '"content_scripts"' "$m" && out "  - has content_scripts (matches: $(tr -d '\n' < "$m" | grep -E -o '"matches" *: *\[[^]]*\]' | head -3 | tr '\n' ' '))"
      grep -E -q '"(background|service_worker)"' "$m" && out "  - has background/service worker"
      grep -E -q '"browser_specific_settings"|"gecko"' "$m" && out "  - has Firefox (gecko) settings"
    elif grep -q -E '"(start_url|display)"' "$m" 2>/dev/null; then
      out "- \`$(rel "$m")\` — web-app manifest (not an extension)"
    fi
  done < <(find_files "$dir" \( -name manifest.json -o -name manifest.*.json -o -name '*.webmanifest' \))
  [ "$found_ext" = 0 ] && out "- No browser-extension manifest found."
  local safari
  safari="$(find_files "$dir" -name '*.pbxproj' | xargs -0 grep -l -E 'com\.apple\.Safari\.web-extension|SFSafariWebExtension' 2>/dev/null | head -5)"
  [ -n "$safari" ] && printf '%s\n' "$safari" | while IFS= read -r f; do out "- Safari web extension target in \`$(rel "$f")\`"; done

  out ""
  out "### Native keyboards and mobile"
  local any=0 f
  while IFS= read -r -d '' f; do any=1; out "- iOS keyboard extension plist: \`$(rel "$f")\` — $(file_state "$f")"; done \
    < <(find_files "$dir" -name '*.plist' | xargs -0 grep -l --null 'com.apple.keyboard-service' 2>/dev/null)
  while IFS= read -r -d '' f; do any=1; out "- Swift keyboard controller: \`$(rel "$f")\` ($(wc -l < "$f" | tr -d ' ') lines) — $(file_state "$f")"; done \
    < <(find_files "$dir" -name '*.swift' | xargs -0 grep -l --null 'UIInputViewController' 2>/dev/null)
  while IFS= read -r -d '' f; do any=1; out "- Android IME manifest: \`$(rel "$f")\` — $(file_state "$f")"; done \
    < <(find_files "$dir" -name AndroidManifest.xml | xargs -0 grep -l --null -E 'BIND_INPUT_METHOD|android\.view\.InputMethod' 2>/dev/null)
  while IFS= read -r -d '' f; do any=1; out "- Android InputMethodService: \`$(rel "$f")\` ($(wc -l < "$f" | tr -d ' ') lines) — $(file_state "$f")"; done \
    < <(find_files "$dir" \( -name '*.kt' -o -name '*.java' \) | xargs -0 grep -l --null 'InputMethodService' 2>/dev/null)
  while IFS= read -r -d '' f; do out "- Xcode project: \`$(rel "$f")\`"; done < <(find "$dir" -name '*.xcodeproj' -prune -print0 2>/dev/null | head -c 4000)
  [ -f "$dir/app.json" ] || [ -f "$dir/app.config.ts" ] || [ -f "$dir/app.config.js" ] && out "- Expo app config present"
  [ -d "$dir/src-tauri" ] && out "- Tauri desktop shell: \`$(rel "$dir/src-tauri")\` — $(ls "$dir/src-tauri" 2>/dev/null | tr '\n' ' ')"
  [ "$any" = 0 ] && out "- No native keyboard code found."

  out ""
  out "### Proofreading, writing-assistance and keyboard source files"
  out ""
  out "| File | Lines | Git state | Exports |"
  out "|---|---|---|---|"
  local count=0
  while IFS= read -r -d '' f; do
    case "$f" in *.md|*.json|*.css|*.html|*.yml|*.yaml|*.xml|*.plist|*.pbxproj|*.toml|*.gradle|*.kts|*.sql) continue ;; esac
    count=$((count + 1))
    [ "$count" -gt 300 ] && { out "| … more than 300 files; truncated | | | |"; break; }
    out "| \`$(rel "$f")\` | $(wc -l < "$f" | tr -d ' ') | $(file_state "$f") | $(exports_of "$f") |"
  done < <(feature_files "$dir")
  [ "$count" = 0 ] && out "| (none) | | | |"

  out ""
  out "### Related tests"
  local tcount=0
  while IFS= read -r -d '' f; do
    tcount=$((tcount + 1))
    out "- \`$(rel "$f")\` — $(grep -c -E '^[[:space:]]*(it|test)(\.each)?\(' "$f" 2>/dev/null) test cases — $(file_state "$f")"
  done < <(feature_files "$dir" | tr '\0' '\n' | grep -E '(\.test\.|\.spec\.|Tests?\.(swift|kt|java)$)' | tr '\n' '\0')
  [ "$tcount" = 0 ] && out "- none"

  out ""
  out "### Documentation mentioning these features"
  while IFS= read -r -d '' f; do
    out "- \`$(rel "$f")\` — $(file_state "$f")"
  done < <(find_files "$dir" -name '*.md' | xargs -0 grep -l --null -I -i -E 'kaiproofread|kai proofread|kaikeys|kai keys|proofread|keyboard extension|browser extension' 2>/dev/null)
}

: > "$REPORT"
out "# Kai local workspace audit"
out ""
out "- Generated: $(date '+%Y-%m-%d %H:%M %Z')"
out "- Workspace: \`$WORKSPACE\`"
out "- Host: $(uname -sm); $(sw_vers -productVersion 2>/dev/null | sed 's/^/macOS /')"
out "- Tools: git $(git --version 2>/dev/null | awk '{print $3}'); node $(node -v 2>/dev/null || echo 'not installed'); xcodebuild $(xcodebuild -version 2>/dev/null | head -1 | awk '{print $2}' || true); java $(java -version 2>&1 | head -1 | grep -E -o '"[^"]+"' | tr -d '"')"
out "- Android SDK: ${ANDROID_HOME:-${ANDROID_SDK_ROOT:-not set}}"
out ""
out "Read-only report. File contents, secrets and dependency folders are excluded."

# Projects: the known ones first, then any other folder whose name suggests these products.
PROJECTS=""
for name in KaiWriter KaiBrowser KAIHUB KAIHUB_PHASE_BETA "KaiDocs Pro"; do
  [ -d "$WORKSPACE/$name" ] && PROJECTS="$PROJECTS$WORKSPACE/$name"$'\n'
done
while IFS= read -r -d '' d; do
  inside=0
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    case "$d/" in "$p"/*) inside=1 ;; esac
  done <<EOF_PROJECTS
$PROJECTS
EOF_PROJECTS
  [ "$inside" = 0 ] && PROJECTS="$PROJECTS$d"$'\n'
done < <(find "$WORKSPACE" -maxdepth 3 -type d \( -name node_modules -o -name .git \) -prune -o -type d \( -iname '*proof*' -o -iname '*keys*' -o -iname '*keyboard*' -o -iname '*extension*' \) -print0 2>/dev/null)

out ""
out "## Workspace folders"
out ""
find "$WORKSPACE" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -print0 2>/dev/null | sort -z | while IFS= read -r -d '' d; do
  if git --no-optional-locks -C "$d" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    out "- \`$(basename "$d")\` — git: $(git --no-optional-locks -C "$d" remote get-url origin 2>/dev/null || echo 'no remote')"
  else
    out "- \`$(basename "$d")\` — not a git repository"
  fi
done

printf '%s' "$PROJECTS" | while IFS= read -r p; do
  [ -n "$p" ] && { echo "Auditing $(rel "$p")…" >&2; audit_project "$p"; }
done

out ""
out "## Named files from the KaiProofread brief"
for f in "KaiWriter/src/components/ui/PremiumProofreadingSettings.tsx" "KaiWriter/src/lib/__tests__/advancedProofreading.test.ts"; do
  if [ -f "$WORKSPACE/$f" ]; then
    out "- \`$f\` — $(wc -l < "$WORKSPACE/$f" | tr -d ' ') lines — $(file_state "$WORKSPACE/$f")"
    out "  - exports: $(exports_of "$WORKSPACE/$f")"
    out "  - imports: $(imports_of "$WORKSPACE/$f")"
  else
    out "- \`$f\` — not found"
  fi
done

out ""
out "_End of report._"
echo "Report written to: $REPORT" >&2
