#!/usr/bin/env bash
# Install the GWAS update checker as a weekly launchd job.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_SRC="$PROJECT_DIR/config/launchd/com.genome-toolkit.gwas-check.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.genome-toolkit.gwas-check.plist"
LABEL="com.genome-toolkit.gwas-check"

if [ ! -f "$PLIST_SRC" ]; then
    echo "Error: plist not found at $PLIST_SRC"
    exit 1
fi

# Unload if already loaded (ignore errors if not loaded)
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

# Ensure target directory exists
mkdir -p "$HOME/Library/LaunchAgents"

# Copy plist
cp "$PLIST_SRC" "$PLIST_DST"
echo "Copied plist to $PLIST_DST"

# Load the agent
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
echo "Loaded $LABEL via launchctl."

echo ""
echo "GWAS update checker installed successfully."
echo "Schedule: every Monday at 09:00"
echo "Logs:     ~/Library/Logs/genome-gwas-check.log"
echo ""
echo "To run immediately:  launchctl kickstart gui/$(id -u)/$LABEL"
echo "To uninstall:        ./scripts/uninstall_gwas_cron.sh"
