#!/usr/bin/env bash
# Install the GWAS update checker as a weekly launchd job.
# Generates the plist from a template — no secrets committed to git.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE="$PROJECT_DIR/config/launchd/com.genome-toolkit.gwas-check.plist.template"
PLIST_DST="$HOME/Library/LaunchAgents/com.genome-toolkit.gwas-check.plist"
LABEL="com.genome-toolkit.gwas-check"

if [ ! -f "$TEMPLATE" ]; then
    echo "Error: template not found at $TEMPLATE"
    exit 1
fi

# Resolve required values
PYTHON_PATH="$(which python3)"
GENOME_VAULT_ROOT="${GENOME_VAULT_ROOT:-$HOME/genome-vault}"

# Try to load HF_TOKEN from SOPS-encrypted secrets first
HF_TOKEN="${HF_TOKEN:-}"
SECRETS_FILE="$PROJECT_DIR/config/secrets.yaml"
if [ -z "$HF_TOKEN" ] && [ -f "$SECRETS_FILE" ] && command -v sops &>/dev/null; then
    HF_TOKEN="$(sops decrypt --extract '["hf_token"]' "$SECRETS_FILE" 2>/dev/null || true)"
fi
if [ -z "$HF_TOKEN" ]; then
    echo "Warning: HF_TOKEN not found in SOPS secrets or env."
    echo "  Add it: sops config/secrets.yaml"
fi

# Unload if already loaded
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

# Generate plist from template
mkdir -p "$HOME/Library/LaunchAgents"
sed \
    -e "s|__PYTHON_PATH__|$PYTHON_PATH|g" \
    -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__HF_TOKEN__|$HF_TOKEN|g" \
    -e "s|__GENOME_VAULT_ROOT__|$GENOME_VAULT_ROOT|g" \
    -e "s|__HOME__|$HOME|g" \
    "$TEMPLATE" > "$PLIST_DST"

echo "Generated plist at $PLIST_DST"

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
