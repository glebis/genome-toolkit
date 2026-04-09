#!/usr/bin/env bash
# Source this file to load SOPS-encrypted secrets into env vars.
# Usage: source scripts/load_secrets.sh
# Works in both bash and zsh.

# Resolve script directory (compatible with bash and zsh)
_LOAD_SECRETS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")" && pwd)"
_SECRETS_FILE="$_LOAD_SECRETS_DIR/../config/secrets.yaml"

if [ ! -f "$_SECRETS_FILE" ]; then
    unset _LOAD_SECRETS_DIR _SECRETS_FILE
    return 1 2>/dev/null || exit 1
fi

if ! command -v sops &>/dev/null; then
    unset _LOAD_SECRETS_DIR _SECRETS_FILE
    return 1 2>/dev/null || exit 1
fi

# Ensure age key is discoverable
export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"

# Decrypt and export each non-empty key
eval "$(sops decrypt "$_SECRETS_FILE" 2>/dev/null | python3 -c "
import sys, yaml
d = yaml.safe_load(sys.stdin)
for k, v in (d or {}).items():
    if v:
        print(f'export {k.upper()}={v!r}')
" 2>/dev/null)"

unset _LOAD_SECRETS_DIR _SECRETS_FILE
