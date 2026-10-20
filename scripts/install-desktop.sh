#!/usr/bin/env bash
# Install/update dsh-sound-notify in the Electron-owned `desktop` profile.
#
# The dsh CLI refuses to manage the reserved `desktop` profile, so this script
# performs the equivalent two steps by hand: copy the package into the
# profile's node_modules and mount it from the profile's own patch layer.
# It is idempotent and keeps a timestamped backup of the patch file.
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="$DSH_HOME/profiles/desktop"
DEST="$PROFILE/node_modules/dsh-sound-notify"

if [ ! -f "$PROFILE/cordis.patch.yml" ]; then
  echo "error: desktop profile not found at $PROFILE" >&2
  echo "       (set DSH_HOME if your harness home lives elsewhere)" >&2
  exit 1
fi

STAMP="$(date +%s)"
cp "$PROFILE/cordis.patch.yml" "$PROFILE/cordis.patch.yml.bak.$STAMP"
echo "backup: $PROFILE/cordis.patch.yml.bak.$STAMP"

mkdir -p "$DEST"
rm -rf "${DEST:?}"/*
cp -R "$SOURCE_DIR/lib" "$SOURCE_DIR/sounds" "$SOURCE_DIR/package.json" \
      "$SOURCE_DIR/cordis.patch.yml" "$SOURCE_DIR/README.md" \
      "$SOURCE_DIR/README.zh.md" "$SOURCE_DIR/LICENSE" "$DEST"/
find "$DEST" -name '.DS_Store' -delete

if grep -q "id: sound-notify" "$PROFILE/cordis.patch.yml"; then
  echo "mount row already present"
else
  cat >> "$PROFILE/cordis.patch.yml" <<'YAML'

# dsh-sound-notify：宿主音效提醒 + Web 设置页（desktop profile 由 Electron 拥有，手工挂载）
- insert:
    - id: sound-notify
      name: 'dsh-sound-notify'
YAML
  echo "mount row appended"
fi

echo "installed: $DEST"
echo
echo "请重启 DSH 桌面应用。重启后："
echo "  - 侧边栏「插件 → 声音提醒」出现三个开关（默认全开）"
echo "  - 任务完成 / 失败 / 等待授权或回答时会播放提示音"
