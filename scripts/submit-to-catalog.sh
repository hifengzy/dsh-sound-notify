#!/usr/bin/env bash
# Open the awesome-dsh-plugin catalog PR for this repository.
#
# The catalog requires the GitHub repository to be at least 1 day old, so this
# script checks the age first and exits with the remaining wait instead of
# opening a PR that CI would reject. Requires an authenticated `gh` CLI.
set -euo pipefail

REPO="${REPO:-hifengzy/dsh-sound-notify}"
CATALOG="${CATALOG:-awesome-dsh-plugin/awesome-dsh-plugin}"
ENTRY_FILE="community/awesome-dsh-plugin.yml"
ENTRY_NAME="data/plugins/hifengzy__dsh-sound-notify.yml"

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SOURCE_DIR"

command -v gh >/dev/null || { echo "error: gh CLI is required" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "error: run 'gh auth login' first" >&2; exit 1; }
[ -f "$ENTRY_FILE" ] || { echo "error: missing $ENTRY_FILE" >&2; exit 1; }

CREATED_AT="$(gh api "repos/$REPO" --jq .created_at)"
AGE_HOURS="$(node -e 'console.log(((Date.now() - Date.parse(process.argv[1])) / 36e5).toFixed(1))' "$CREATED_AT")"
echo "repository $REPO is ${AGE_HOURS}h old (catalog minimum: 24h)"
if node -e 'process.exit(Number(process.argv[1]) >= 24 ? 0 : 1)' "$AGE_HOURS"; then
  :
else
  echo "not eligible yet — re-run this script after the 24h window." >&2
  exit 1
fi

OWNER="${REPO%%/*}"
FORK="$OWNER/awesome-dsh-plugin"
gh repo view "$FORK" >/dev/null 2>&1 || gh repo fork "$CATALOG" --clone=false

# A fresh fork is not immediately readable, so wait for it before cloning.
for _ in $(seq 1 40); do
  gh repo view "$FORK" >/dev/null 2>&1 && break
  sleep 2
done
gh repo view "$FORK" >/dev/null 2>&1 || { echo "error: fork $FORK is not available yet" >&2; exit 1; }

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
gh repo clone "$FORK" "$WORKDIR/catalog" -- --depth=1
cd "$WORKDIR/catalog"
git switch -c "add-dsh-sound-notify-$(date +%Y%m%d%H%M%S)"
mkdir -p "$(dirname "$ENTRY_NAME")"
cp "$SOURCE_DIR/$ENTRY_FILE" "$ENTRY_NAME"
git add "$ENTRY_NAME"
git commit -m "Add $OWNER/dsh-sound-notify"
git push -u origin HEAD

gh pr create --repo "$CATALOG" \
  --title "Add $OWNER/dsh-sound-notify" \
  --body "Adds **dsh-sound-notify** to \`notify\`: sound notifications for DSH when a task completes, fails, or waits for approval, with per-category switches.

- Repo: https://github.com/$OWNER/dsh-sound-notify
- Category: notify
- Declares \`dsh.bundle\` (installable via \`dsh plugin add\`) and \`dsh.client\` (settings UI)
- Adds only \`$ENTRY_NAME\`" \
  --head "$OWNER:$(git branch --show-current)"
