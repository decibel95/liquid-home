#!/usr/bin/env bash
# Print the CHANGELOG.md section of one version as plain release notes.
# Usage: scripts/release-notes.sh <version> [changelog]   (version without the leading v)
# Exits 1 with a message on stderr when the section is missing or empty.
set -euo pipefail

version="${1:?usage: release-notes.sh <version> [changelog]}"
version="${version#v}"
file="${2:-CHANGELOG.md}"

notes=$(awk -v v="$version" '
  { sub(/\r$/, "") }
  /^## / { if (on) exit; on = ($2 == v); next }
  /^<!--/ { if (on) exit }
  on && $0 != "The current version." { print }
' "$file" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' | sed '/./,$!d')

if [ -z "$notes" ]; then
  echo "No CHANGELOG.md section found for version $version (expected a '## $version' heading with content)" >&2
  exit 1
fi
printf '%s\n' "$notes"
