#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/Users/stork/pachinko-sim"
ADDON_DIR="$PROJECT_ROOT/tools/blender-mcp"
ADDON_FILE="$ADDON_DIR/addon.py"

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "This setup expects the Apple Silicon Mac mini (arm64)." >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  HOMEBREW_INSTALLER="$(mktemp -t pachinko-homebrew-install.XXXXXX)"
  trap 'rm -f "$HOMEBREW_INSTALLER"' EXIT
  curl --fail --location --proto '=https' --tlsv1.2 \
    https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh \
    --output "$HOMEBREW_INSTALLER"
  /bin/bash "$HOMEBREW_INSTALLER"
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

brew install --cask blender
brew install uv

mkdir -p "$ADDON_DIR"
curl --fail --location --proto '=https' --tlsv1.2 \
  https://raw.githubusercontent.com/ahujasid/blender-mcp/main/addon.py \
  --output "$ADDON_FILE"

BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender"
UVX_BIN="$(command -v uvx)"
CODEX_BIN="$(command -v codex)"

if [[ ! -x "$BLENDER_BIN" ]]; then
  echo "Blender executable was not found at $BLENDER_BIN" >&2
  exit 3
fi

"$BLENDER_BIN" --background --python-expr "
import bpy, pathlib, shutil
source = pathlib.Path(r'$ADDON_FILE')
target_dir = pathlib.Path(bpy.utils.user_resource('SCRIPTS', path='addons', create=True))
target = target_dir / 'blender_mcp.py'
shutil.copy2(source, target)
bpy.ops.preferences.addon_enable(module='blender_mcp')
bpy.ops.wm.save_userpref()
print(f'Enabled Blender MCP addon: {target}')
"

if "$CODEX_BIN" mcp list | awk '{print $1}' | grep -qx 'blender'; then
  "$CODEX_BIN" mcp remove blender
fi

"$CODEX_BIN" mcp add blender \
  --env DISABLE_TELEMETRY=true \
  --env BLENDER_HOST=127.0.0.1 \
  --env BLENDER_PORT=9876 \
  -- "$UVX_BIN" --python 3.11 blender-mcp

echo
"$BLENDER_BIN" --version | head -n 2
"$CODEX_BIN" mcp list
echo
echo "Setup complete. Open Blender, press N, select BlenderMCP, then click Connect to Claude."
echo "After that, fully restart Codex so it loads the new MCP server."
