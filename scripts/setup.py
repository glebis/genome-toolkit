#!/usr/bin/env python3
"""Interactive setup wizard for Genome Toolkit.

Collects API keys, paths, TTS/STT preferences, and genetic parameters.
API keys are stored securely in macOS Keychain (fallback: .env file).
Other settings go to config/settings.yaml.

Usage:
    python scripts/setup.py
    python scripts/setup.py --reconfigure   # re-run, keeping existing values as defaults
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).parent))
from lib.secrets import get_secret, set_secret, SECRETS

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
SETTINGS_PATH = CONFIG_DIR / "settings.yaml"
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


def load_existing() -> dict:
    if SETTINGS_PATH.is_file():
        with open(SETTINGS_PATH) as f:
            return yaml.safe_load(f) or {}
    return {}


def ask(prompt: str, default: str = "", secret: bool = False, options: list[str] | None = None) -> str:
    """Prompt user for input with optional default and validation."""
    suffix = ""
    if options:
        suffix = f" [{'/'.join(options)}]"
    if default and not secret:
        suffix += f" (default: {default})"
    elif default and secret:
        suffix += " (already set, Enter to keep)"

    full_prompt = f"  {prompt}{suffix}: "

    if secret:
        try:
            import getpass
            val = getpass.getpass(full_prompt)
        except (ImportError, EOFError):
            val = input(full_prompt)
    else:
        val = input(full_prompt)

    val = val.strip()
    if not val:
        return default

    if options and val not in options:
        print(f"    Invalid choice. Options: {', '.join(options)}")
        return ask(prompt, default, secret, options)

    return val


def ask_list(prompt: str, existing: list[str] | None = None) -> list[str]:
    """Prompt for a comma-separated list."""
    default_str = ", ".join(existing) if existing else ""
    suffix = f" (default: {default_str})" if default_str else ""
    val = input(f"  {prompt} (comma-separated){suffix}: ").strip()
    if not val:
        return existing or []
    return [item.strip() for item in val.split(",") if item.strip()]


def section(title: str):
    print(f"\n{'─' * 50}")
    print(f"  {title}")
    print(f"{'─' * 50}")


def mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return key
    return key[:4] + "..." + key[-4:]


def run_setup():
    existing = load_existing()

    print()
    print("╔══════════════════════════════════════════════════╗")
    print("║         GENOME TOOLKIT — SETUP WIZARD           ║")
    print("╚══════════════════════════════════════════════════╝")
    print()
    print("  Configure your toolkit step by step.")
    print("  Press Enter to accept defaults shown in parentheses.")

    # --- API Keys ---
    section("API KEYS")
    print("  Keys are stored in macOS Keychain (or .env as fallback).")
    print()

    current_anthropic = get_secret("anthropic_api_key")
    if current_anthropic:
        print(f"  Current Anthropic key: {mask_key(current_anthropic)}")
    anthropic_key = ask("Anthropic API key", default=current_anthropic, secret=True)

    current_groq = get_secret("groq_api_key")
    if current_groq:
        print(f"  Current Groq key: {mask_key(current_groq)}")
    groq_key = ask("Groq API key (for Orpheus TTS)", default=current_groq, secret=True)

    # --- Paths ---
    section("PATHS")

    db_path = ask(
        "Genome database path",
        default=existing.get("genome_db_path", "./data/genome.db"),
    )
    vault_path = ask(
        "Obsidian vault path",
        default=existing.get("genome_vault_path", "~/Brains/genome"),
    )
    # Validate vault path
    expanded_vault = Path(vault_path).expanduser()
    if not expanded_vault.exists():
        print(f"    Warning: {expanded_vault} does not exist yet.")
        create = ask("Create it?", default="n", options=["y", "n"])
        if create == "y":
            expanded_vault.mkdir(parents=True, exist_ok=True)
            print(f"    Created {expanded_vault}")

    # --- TTS ---
    section("TEXT-TO-SPEECH")

    tts_existing = existing.get("tts", {})
    tts_provider = ask(
        "TTS provider",
        default=tts_existing.get("provider", "orpheus"),
        options=["orpheus", "browser", "none"],
    )

    tts_voice = tts_existing.get("voice", "tara")
    tts_emotion = tts_existing.get("emotion_default", "")
    tts_speed = tts_existing.get("speed", 1.0)

    if tts_provider == "orpheus":
        if not groq_key:
            print("    Note: Orpheus requires a Groq API key. Set it above or via GROQ_API_KEY env var.")
        tts_voice = ask(
            "Voice",
            default=tts_voice,
            options=["tara", "leah", "mia", "jess", "leo", "dan"],
        )
        tts_emotion = ask(
            "Default emotion (blank for neutral)",
            default=tts_emotion,
        )
        speed_str = ask("Playback speed", default=str(tts_speed))
        try:
            tts_speed = float(speed_str)
        except ValueError:
            tts_speed = 1.0

    # --- STT ---
    section("SPEECH-TO-TEXT")

    stt_existing = existing.get("stt", {})
    stt_lang = ask(
        "STT language (BCP-47)",
        default=stt_existing.get("language", "en-US"),
    )

    # --- Genetics ---
    section("GENETICS PROFILE")

    gen_existing = existing.get("genetics", {})
    population = ask(
        "Ancestry population for PRS",
        default=gen_existing.get("population", "EUR"),
        options=["EUR", "AFR", "EAS", "SAS", "AMR", "NFE", "FIN"],
    )

    print("\n  Current medications help prioritize pharmacogenomics analysis.")
    medications = ask_list(
        "Current medications",
        existing=gen_existing.get("medications", []),
    )

    print("\n  Health goals determine which genes are prioritized during onboarding.")
    print("  Options: medication_safety, mental_health, longevity, nutrition, fitness, comprehensive")
    health_goals = ask_list(
        "Health goals",
        existing=gen_existing.get("health_goals", []),
    )

    # --- Store API keys securely ---
    section("STORING API KEYS")
    for key_name, key_value in [("anthropic_api_key", anthropic_key), ("groq_api_key", groq_key)]:
        if key_value:
            method = set_secret(key_name, key_value)
            env_name = SECRETS.get(key_name, key_name.upper())
            print(f"  {env_name}: stored in {method}")
        else:
            print(f"  {SECRETS.get(key_name, key_name.upper())}: skipped (empty)")

    # --- Build settings dict (no secrets!) ---
    settings = {
        "genome_db_path": db_path,
        "genome_vault_path": vault_path,
        "tts": {
            "provider": tts_provider,
            "voice": tts_voice,
            "emotion_default": tts_emotion,
            "speed": tts_speed,
        },
        "stt": {
            "language": stt_lang,
        },
        "genetics": {
            "population": population,
            "medications": medications,
            "health_goals": health_goals,
        },
        "display": existing.get("display", {
            "theme": "warm",
            "units": "metric",
        }),
    }

    # --- Write settings.yaml ---
    section("SAVING CONFIGURATION")

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    header = (
        "# User Settings — generated by scripts/setup.py\n"
        "# Re-run `python scripts/setup.py` to reconfigure\n\n"
    )
    with open(SETTINGS_PATH, "w") as f:
        f.write(header)
        yaml.dump(settings, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    print(f"  Saved: {SETTINGS_PATH}")

    # --- Write .env (paths only — API keys are in keychain) ---
    env_lines = [
        "# Generated by scripts/setup.py",
        "# API keys are stored in macOS Keychain (service: genome-toolkit)",
        "",
        f"GENOME_DB_PATH={db_path}",
        f"GENOME_DATA_DIR=./data",
        f"GENOME_VAULT_PATH={vault_path}",
        "",
    ]

    with open(ENV_PATH, "w") as f:
        f.write("\n".join(env_lines))

    print(f"  Saved: {ENV_PATH}")

    # --- Summary ---
    section("SETUP COMPLETE")
    print(f"  TTS:         {tts_provider}" + (f" ({tts_voice})" if tts_provider == "orpheus" else ""))
    print(f"  STT:         {stt_lang}")
    print(f"  Population:  {population}")
    if medications:
        print(f"  Medications: {', '.join(medications)}")
    if health_goals:
        print(f"  Goals:       {', '.join(health_goals)}")
    print(f"  Vault:       {vault_path}")
    print()
    print("  Next steps:")
    print("    1. Import your genome data:  python scripts/genome_init.py --help")
    print("    2. Start the app:            ./start.sh")
    print("    3. Re-configure anytime:     python scripts/setup.py")
    print()


if __name__ == "__main__":
    try:
        run_setup()
    except KeyboardInterrupt:
        print("\n\n  Setup cancelled.")
        sys.exit(1)
