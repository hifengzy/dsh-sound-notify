#!/usr/bin/env bash
# Migrate a v0.1.0 manual desktop install to a managed third-party install.
#
# v0.1.0 told users to copy the package into
# `profiles/desktop/node_modules` and mount it from the profile patch. That
# install is not recorded in the profile manifest, so the Plugins page cannot
# list, update or uninstall it, and the desktop updater prunes it on the next
# `pnpm install`. This script removes those two leftovers (keeping the saved
# switch values) and prints the managed install steps.
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="$DSH_HOME/profiles/desktop"
PATCH="$PROFILE/cordis.patch.yml"
MANIFEST="$PROFILE/package.json"

[ -f "$PATCH" ] || { echo "error: desktop profile not found at $PROFILE" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "error: missing $MANIFEST" >&2; exit 1; }

STAMP="$(date +%s)"
cp "$PATCH" "$PATCH.bak.$STAMP"
cp "$MANIFEST" "$MANIFEST.bak.$STAMP"
echo "backup: $PATCH.bak.$STAMP"
echo "backup: $MANIFEST.bak.$STAMP"

if node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.exit(manifest.dependencies?.["dsh-sound-notify"] ? 0 : 1);
' "$MANIFEST"; then
  echo "already managed: $MANIFEST declares dsh-sound-notify as a dependency; nothing to migrate."
  exit 0
fi

rm -rf "$PROFILE/node_modules/dsh-sound-notify"
echo "removed unmanaged node_modules/dsh-sound-notify"

node - "$PATCH" <<'NODE'
const fs = require('fs')
const file = process.argv[2]
const lines = fs.readFileSync(file, 'utf8').split('\n')
const out = []
let i = 0
let removed = 0
while (i < lines.length) {
  if (/^-\s+insert:\s*$/.test(lines[i])) {
    let j = i + 1
    while (j < lines.length && !/^-(?:\s|$)/.test(lines[j])) j += 1
    const block = lines.slice(i, j).join('\n')
    if (/^\s+- id:\s*['"]?sound-notify['"]?\s*$/m.test(block)) {
      while (out.length > 0 && /^#.*dsh-sound-notify/.test(out[out.length - 1])) out.pop()
      i = j
      removed += 1
      continue
    }
  }
  out.push(lines[i])
  i += 1
}
const text = `${out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')}\n`
fs.writeFileSync(file, text)
console.log(removed > 0 ? 'removed the unmanaged mount row from cordis.patch.yml' : 'no unmanaged mount row found in cordis.patch.yml')
NODE

echo
echo "Migrated. The saved switch values (the id-targeted sound-notify config row) were kept."
echo "Install it again as a managed third-party plugin:"
echo "  1. Open DSH → left sidebar → Plugins"
echo "  2. Click “Add plugin”"
echo "  3. Paste: https://github.com/hifengzy/dsh-sound-notify"
echo "  4. Install, then restart DSH if asked"
echo
echo "After that it appears under Plugins → Installed plugins with uninstall/update controls,"
echo "and the sound switches live on its own package page."
