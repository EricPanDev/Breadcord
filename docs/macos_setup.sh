#!/usr/bin/env bash
set -euo pipefail

# --- Detect architecture (handle Rosetta) ---
arch_name="$(uname -m)"
if [[ "$arch_name" == "x86_64" ]]; then
  if [[ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" == "1" ]]; then
    arch_name="arm64"
  fi
fi

case "$arch_name" in
  arm64)
    DMG_URL="https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-macos-arm64.dmg"
    ;;
  x86_64|amd64)
    DMG_URL="https://github.com/ericpandev/breadcord/releases/latest/download/Breadcord-macos-amd64.dmg"
    ;;
  *)
    echo "Unsupported architecture: $arch_name" >&2
    exit 1
    ;;
esac

# --- Setup temp paths ---
WORKDIR="$(mktemp -d)"
DMG_PATH="$WORKDIR/breadcord.dmg"
PLIST_FILE="$WORKDIR/attach.plist"
MOUNT_DEV=""
MOUNT_POINT=""

cleanup() {
  # Prefer detaching by device; fall back to mount point.
  if [[ -n "${MOUNT_DEV:-}" ]]; then
    hdiutil detach "$MOUNT_DEV" >/dev/null 2>&1 || true
  elif [[ -n "${MOUNT_POINT:-}" && -d "$MOUNT_POINT" ]]; then
    hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "Downloading Breadcord for $arch_name..."
curl -L --fail --progress-bar "$DMG_URL" -o "$DMG_PATH"

echo "Mounting DMG..."
/usr/bin/hdiutil attach -nobrowse -readonly -plist "$DMG_PATH" > "$PLIST_FILE"

# --- Robustly extract the first entity that has a mount-point ---
# We iterate :system-entities until we find one with a :mount-point.
i=0
while :; do
  if ! /usr/libexec/PlistBuddy -c "Print :system-entities:$i" "$PLIST_FILE" >/dev/null 2>&1; then
    break
  fi
  mp="$(/usr/libexec/PlistBuddy -c "Print :system-entities:$i:mount-point" "$PLIST_FILE" 2>/dev/null || true)"
  if [[ -n "$mp" ]]; then
    MOUNT_POINT="$mp"
    dev="$(/usr/libexec/PlistBuddy -c "Print :system-entities:$i:dev-entry" "$PLIST_FILE" 2>/dev/null || true)"
    # Some images store dev-entry on a sibling entity; if empty, try the next few.
    if [[ -z "$dev" ]]; then
      for j in $((i)) $((i+1)) $((i+2)); do
        dtry="$(/usr/libexec/PlistBuddy -c "Print :system-entities:$j:dev-entry" "$PLIST_FILE" 2>/dev/null || true)"
        [[ -n "$dtry" ]] && { dev="$dtry"; break; }
      done
    fi
    MOUNT_DEV="$dev"
    break
  fi
  i=$((i+1))
done

if [[ -z "$MOUNT_POINT" ]]; then
  echo "Failed to find mount point from DMG attach output." >&2
  exit 1
fi

echo "Mounted at: $MOUNT_POINT"
[[ -n "$MOUNT_DEV" ]] && echo "Device: $MOUNT_DEV"

# --- Locate the Breadcord folder/app on the mounted volume ---
SRC=""
if [[ -d "$MOUNT_POINT/Breadcord.app" ]]; then
  SRC="$MOUNT_POINT/Breadcord.app"
elif [[ -d "$MOUNT_POINT/Breadcord" ]]; then
  SRC="$MOUNT_POINT/Breadcord"
else
  SRC="$(find "$MOUNT_POINT" -maxdepth 2 \( -iname 'Breadcord*.app' -o -name 'Breadcord' \) -type d | head -n 1 || true)"
fi

if [[ -z "$SRC" ]]; then
  echo "Could not find 'Breadcord' in the mounted image." >&2
  exit 1
fi
echo "Found source: $SRC"

# --- Copy to /Applications (preserve metadata) ---
DEST="/Applications/$(basename "$SRC")"
echo "Copying to $DEST (you may be prompted for your password)..."
sudo mkdir -p /Applications
sudo ditto "$SRC" "$DEST"

echo "Removing Gatekeeper quarantine attributes..."
sudo xattr -dr com.apple.quarantine "$DEST" || true

echo "Done!"
