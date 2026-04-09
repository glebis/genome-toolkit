#!/usr/bin/env bash
# Remove the GWAS update checker launchd job.
set -euo pipefail

LABEL="com.genome-toolkit.gwas-check"
PLIST_DST="$HOME/Library/LaunchAgents/com.genome-toolkit.gwas-check.plist"

# Unload the agent
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null && \
    echo "Unloaded $LABEL." || \
    echo "Agent was not loaded (already removed or never installed)."

# Remove the plist file
if [ -f "$PLIST_DST" ]; then
    rm "$PLIST_DST"
    echo "Removed $PLIST_DST"
else
    echo "Plist file not found at $PLIST_DST (already removed)."
fi

echo ""
echo "GWAS update checker uninstalled."
