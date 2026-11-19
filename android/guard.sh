#!/usr/bin/env bash
# Lane guard for the native Android app. Every rule is a "want 0". Walks tracked and untracked
# (not ignored) files under android/, so a new file is checked before it is committed.
# Exit 0 clean, 1 on a violation (each one named), 2 when it walked too few files to mean anything.
set -u
cd "$(git rev-parse --show-toplevel)"
files=()
while IFS= read -r -d '' f; do [ -f "$f" ] && files+=("$f"); done < <(git ls-files -z --cached --others --exclude-standard -- android ':(exclude)android/guard.sh')
echo "guard(android): ${#files[@]} files"
if [ "${#files[@]}" -lt 10 ]; then echo "guard(android): walked under 10 files"; exit 2; fi
code=(); for f in "${files[@]}"; do case "$f" in *.kt|*.kts|*.xml|*.properties|*.pro|*.json|*.toml) code+=("$f");; esac; done
bad=0
hit() { # $1 rule name; the matching lines arrive on stdin (process substitution, so bad=1 sticks)
  local out; out=$(cat); [ -z "$out" ] && return; echo "guard(android): $1"; echo "$out" | sed 's/^/  /'; bad=1; }
only() { printf '%s\n' "$@"; }
# 1. Model calls only in the AI client (and the live device tests).
hit "Firebase.ai( or generativeModel( outside ai/AiClient.kt" < <(only "${code[@]}" | grep -v -E '/ai/AiClient\.kt$|/androidTest/.*/live/' | tr '\n' '\0' | xargs -0 grep -n -I -E 'Firebase\.ai\(|generativeModel\(' 2>/dev/null)
# 2. No token counting, no ML Kit, no other model API.
hit "countTokens" < <(only "${code[@]}" | tr '\n' '\0' | xargs -0 grep -n -I -E 'countTokens' 2>/dev/null)
hit "com.google.mlkit import" < <(only "${code[@]}" | tr '\n' '\0' | xargs -0 grep -n -I -E 'com\.google\.mlkit' 2>/dev/null)
# 3. The App Check debug provider only in the debug source set.
hit "DebugAppCheckProviderFactory outside app/src/debug" < <(only "${code[@]}" | grep -v -E '^android/app/src/debug/' | tr '\n' '\0' | xargs -0 grep -n -I 'DebugAppCheckProviderFactory' 2>/dev/null)
main=(); for f in "${code[@]}"; do case "$f" in android/app/src/main/*) main+=("$f");; esac; done
if [ "${#main[@]}" -gt 0 ]; then
  # 4. Verdict words come from the engine, never from Kotlin or resources.
  hit "a verdict headline in app/src/main" < <(only "${main[@]}" | tr '\n' '\0' | xargs -0 grep -n -I -E 'OK to pack|Take it out|Check this' 2>/dev/null)
  # 5. Model names come from Remote Config; the one in-app default lives in remote_config_defaults.xml.
  hit "gemini- in app/src/main outside remote_config_defaults.xml" < <(only "${main[@]}" | grep -v -E '/res/xml/remote_config_defaults\.xml$' | tr '\n' '\0' | xargs -0 grep -n -I 'gemini-' 2>/dev/null)
  # 6. No approval wording, except the required "not affiliated" disclaimer.
  hit "approval wording in app/src/main" < <(only "${main[@]}" | tr '\n' '\0' | xargs -0 grep -n -I -E '[Aa]pproved|safe to mail' 2>/dev/null | grep -v 'Not affiliated with or approved by the US Postal Service')
fi
# 7. ASCII punctuation: no em dash, en dash or curly quotes anywhere under android/.
hit "em dash, en dash or curly quote" < <(only "${files[@]}" | tr '\n' '\0' | xargs -0 grep -n -I -E $'—|–|‘|’|“|”' 2>/dev/null)
if [ "$bad" -ne 0 ]; then exit 1; fi
echo "guard(android): clean"
