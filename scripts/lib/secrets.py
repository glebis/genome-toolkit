"""Secure API key storage using macOS Keychain (via keyring).

Resolution order for each secret:
  1. Environment variable (e.g. ANTHROPIC_API_KEY)
  2. macOS Keychain (service: genome-toolkit)
  3. .env file (fallback)

Keys are never stored in YAML or other plaintext config files.
"""
from __future__ import annotations

import os
from pathlib import Path

SERVICE_NAME = "genome-toolkit"

# Known secrets and their env var names
SECRETS = {
    "anthropic_api_key": "ANTHROPIC_API_KEY",
    "groq_api_key": "GROQ_API_KEY",
}


def _keyring_available() -> bool:
    try:
        import keyring
        # Test that backend is functional (not the null backend)
        backend = keyring.get_keyring()
        return "fail" not in type(backend).__name__.lower() and "null" not in type(backend).__name__.lower()
    except Exception:
        return False


def get_secret(key: str) -> str:
    """Retrieve a secret by key name.

    Checks: env var -> keychain -> .env file.
    """
    env_var = SECRETS.get(key, key.upper())

    # 1. Environment variable
    val = os.environ.get(env_var, "")
    if val:
        return val

    # 2. Keychain
    if _keyring_available():
        try:
            import keyring
            val = keyring.get_password(SERVICE_NAME, key)
            if val:
                return val
        except Exception:
            pass

    # 3. .env file
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() == env_var:
                return v.strip()

    return ""


def set_secret(key: str, value: str) -> str:
    """Store a secret securely.

    Returns the storage method used: 'keychain' or 'env_file'.
    """
    if not value:
        return "skipped"

    # Try keychain first
    if _keyring_available():
        try:
            import keyring
            keyring.set_password(SERVICE_NAME, key, value)
            return "keychain"
        except Exception:
            pass

    # Fallback: write to .env
    env_var = SECRETS.get(key, key.upper())
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"

    lines = []
    found = False
    if env_path.is_file():
        for line in env_path.read_text().splitlines():
            k = line.split("=", 1)[0].strip()
            if k == env_var:
                lines.append(f"{env_var}={value}")
                found = True
            else:
                lines.append(line)

    if not found:
        lines.append(f"{env_var}={value}")

    env_path.write_text("\n".join(lines) + "\n")
    return "env_file"


def delete_secret(key: str) -> bool:
    """Remove a secret from keychain."""
    if _keyring_available():
        try:
            import keyring
            keyring.delete_password(SERVICE_NAME, key)
            return True
        except Exception:
            return False
    return False


def get_anthropic_key() -> str:
    return get_secret("anthropic_api_key")


def get_groq_key() -> str:
    return get_secret("groq_api_key")
