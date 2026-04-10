#!/usr/bin/env python3
"""Migrate an existing Obsidian genome vault to the current toolkit format.

Scans all .md files in the vault, identifies outdated frontmatter, and
optionally updates files in place (with backup).

Usage:
    python3 vault_migrate.py --vault /path/to/vault --dry-run
    python3 vault_migrate.py --vault /path/to/vault --backup-dir /tmp/vault-backup
"""
from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import frontmatter
import yaml

# Add scripts/ dir so we can import lib modules when run directly
sys.path.insert(0, str(Path(__file__).parent))

from lib.vault_parser import iter_vault_notes, parse_note, VaultNote

# ---------------------------------------------------------------------------
# Known field renames: old_name -> new_name
# ---------------------------------------------------------------------------

FIELD_RENAMES: dict[str, str] = {
    "gene": "gene_symbol",          # Legacy: gene: BDNF  ->  gene_symbol: BDNF
    "name": "full_name",            # Legacy: name: ...   ->  full_name: ...
    "system": "systems",            # Legacy singular      ->  list field
    "phenotype": "trait",           # Legacy: phenotype    ->  trait (in phenotype notes)
    "protocol": "protocol_name",    # Legacy: protocol     ->  protocol_name
    "reviewed": "last_reviewed",    # Legacy: reviewed     ->  last_reviewed
    "date": "created_date",         # Legacy: date         ->  created_date
    "created": "created_date",      # Legacy: created      ->  created_date
    "updated": "last_reviewed",     # Legacy: updated      ->  last_reviewed
    "tier": "evidence_tier",        # Legacy: tier         ->  evidence_tier
    "evidence": "evidence_tier",    # Legacy: evidence     ->  evidence_tier (if plain)
    "link": "brain_vault_link",     # Legacy: link         ->  brain_vault_link
}

# Required fields per note type (must exist in frontmatter after migration)
REQUIRED_FIELDS: dict[str, list[str]] = {
    "gene": [
        "type", "gene_symbol", "full_name", "chromosome",
        "systems", "evidence_tier", "created_date", "tags",
    ],
    "phenotype": [
        "type", "trait", "evidence_tier", "created_date", "tags",
    ],
    "protocol": [
        "type", "protocol_name", "evidence_tier", "actionability",
        "created_date", "tags",
    ],
    "system": [
        "type", "system_name", "created_date", "tags",
    ],
}

# Default tags per type if tags field is missing
DEFAULT_TAGS: dict[str, list[str]] = {
    "gene": ["gene"],
    "phenotype": ["phenotype"],
    "protocol": ["protocol"],
    "system": ["system"],
}

# Folders to skip during scan
EXCLUDE_DIRS: set[str] = {"Templates", "data", ".obsidian", ".trash", ".claude", "Guides"}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class MigrationChange:
    """A single frontmatter change to apply to a note."""
    kind: str          # "rename", "add_field", "fix_type", "normalize_date"
    description: str
    field: str
    old_value: Any = None
    new_value: Any = None


@dataclass
class MigrationResult:
    """Result of analysing / migrating a single note."""
    path: Path
    changes: list[MigrationChange] = field(default_factory=list)
    skipped: bool = False
    skip_reason: str = ""
    error: str = ""

    @property
    def needs_update(self) -> bool:
        return bool(self.changes) and not self.skipped and not self.error


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def _infer_type_from_path(path: Path, vault_root: Path) -> str | None:
    """Guess note type from folder name."""
    try:
        parts = path.relative_to(vault_root).parts
    except ValueError:
        return None
    folder_map = {
        "genes": "gene",
        "gene": "gene",
        "phenotypes": "phenotype",
        "phenotype": "phenotype",
        "protocols": "protocol",
        "protocol": "protocol",
        "systems": "system",
        "system": "system",
    }
    for part in parts[:-1]:
        t = folder_map.get(part.lower())
        if t:
            return t
    return None


def _normalize_date_value(value: Any) -> str | None:
    """Return ISO date string from various Obsidian date formats, or None if not parseable."""
    if isinstance(value, date):
        return value.isoformat()
    if value is None:
        return None
    s = str(value).strip().strip("'\"")
    # Strip [[...]]
    if s.startswith("[[") and s.endswith("]]"):
        s = s[2:-2]
    # YYYYMMDD
    if len(s) == 8 and s.isdigit():
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    # Already ISO
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return s
    return None


def analyse_note(note: VaultNote, vault_root: Path) -> MigrationResult:
    """Analyse a note and return the changes needed to bring it to current format."""
    result = MigrationResult(path=note.path)

    if not note.frontmatter_valid:
        result.error = "Frontmatter could not be parsed"
        return result

    fm = dict(note.frontmatter)

    # 1. Ensure 'type' field exists
    if "type" not in fm:
        inferred = _infer_type_from_path(note.path, vault_root)
        if inferred:
            result.changes.append(MigrationChange(
                kind="add_field",
                description=f"Add missing 'type' field (inferred: {inferred!r})",
                field="type",
                old_value=None,
                new_value=inferred,
            ))
            fm["type"] = inferred
        else:
            result.skipped = True
            result.skip_reason = "Cannot determine note type (no 'type' field, no recognisable folder)"
            return result

    note_type = fm.get("type")

    # 2. Rename legacy fields
    for old_name, new_name in FIELD_RENAMES.items():
        if old_name in fm and new_name not in fm:
            result.changes.append(MigrationChange(
                kind="rename",
                description=f"Rename '{old_name}' -> '{new_name}'",
                field=old_name,
                old_value=fm[old_name],
                new_value=fm[old_name],
            ))
            fm[new_name] = fm.pop(old_name)

    # 3. Ensure 'systems' is a list (if present)
    if "systems" in fm and not isinstance(fm["systems"], list):
        val = fm["systems"]
        result.changes.append(MigrationChange(
            kind="fix_type",
            description="Convert 'systems' from scalar to list",
            field="systems",
            old_value=val,
            new_value=[val] if val else [],
        ))
        fm["systems"] = [val] if val else []

    # 4. Normalize date fields to ISO 8601 strings
    for date_field in ("created_date", "last_reviewed"):
        if date_field in fm:
            raw = fm[date_field]
            normalized = _normalize_date_value(raw)
            if normalized and str(raw).strip("'\"") != normalized:
                result.changes.append(MigrationChange(
                    kind="normalize_date",
                    description=f"Normalize date field '{date_field}': {raw!r} -> {normalized!r}",
                    field=date_field,
                    old_value=raw,
                    new_value=normalized,
                ))
                fm[date_field] = normalized

    # 5. Add missing required fields (add with empty/default value)
    required = REQUIRED_FIELDS.get(note_type, [])
    for req_field in required:
        if req_field not in fm:
            default = _default_value_for(req_field, note_type)
            result.changes.append(MigrationChange(
                kind="add_field",
                description=f"Add missing required field '{req_field}'",
                field=req_field,
                old_value=None,
                new_value=default,
            ))

    # 6. Ensure tags includes the type tag
    expected_tag = note_type
    existing_tags = fm.get("tags", [])
    if isinstance(existing_tags, str):
        existing_tags = [existing_tags]
    if not isinstance(existing_tags, list):
        existing_tags = []
    if "tags" not in fm or not existing_tags:
        defaults = DEFAULT_TAGS.get(note_type, [note_type])
        result.changes.append(MigrationChange(
            kind="add_field",
            description=f"Add missing 'tags' field with defaults {defaults}",
            field="tags",
            old_value=fm.get("tags"),
            new_value=defaults,
        ))
    elif expected_tag and expected_tag not in existing_tags:
        new_tags = [expected_tag] + existing_tags
        result.changes.append(MigrationChange(
            kind="fix_type",
            description=f"Add type tag '{expected_tag}' to tags list",
            field="tags",
            old_value=existing_tags,
            new_value=new_tags,
        ))

    return result


def _default_value_for(field_name: str, note_type: str) -> Any:
    """Return a sensible empty default for a missing required field."""
    list_fields = {"systems", "contributing_genes", "contributing_systems",
                   "protocols", "relevant_genes", "genes", "phenotypes", "tags", "personal_variants"}
    if field_name in list_fields:
        return []
    if field_name == "type":
        return note_type
    if field_name == "tags":
        return DEFAULT_TAGS.get(note_type, [note_type])
    if field_name in ("created_date", "last_reviewed"):
        return date.today().isoformat()
    return None


# ---------------------------------------------------------------------------
# Applying changes
# ---------------------------------------------------------------------------

def apply_changes(note: VaultNote, changes: list[MigrationChange], backup_dir: Path | None) -> None:
    """Write updated frontmatter to disk, optionally backing up original first."""
    path = note.path

    # Read the raw file
    raw_text = path.read_text(encoding="utf-8")

    # Parse with python-frontmatter to get current metadata + content
    post = frontmatter.loads(raw_text)
    meta = dict(post.metadata)

    # Apply each change
    for change in changes:
        if change.kind == "rename":
            old_name = change.field
            new_name = FIELD_RENAMES.get(old_name, old_name)
            if old_name in meta:
                meta[new_name] = meta.pop(old_name)
        elif change.kind in ("add_field", "fix_type"):
            # Determine what value to use
            meta[change.field] = change.new_value
        elif change.kind == "normalize_date":
            meta[change.field] = change.new_value

    # Back up original before writing
    if backup_dir is not None:
        backup_dir.mkdir(parents=True, exist_ok=True)
        rel = path.name
        backup_path = backup_dir / rel
        # Avoid collisions: append a counter if needed
        counter = 0
        while backup_path.exists():
            counter += 1
            backup_path = backup_dir / f"{path.stem}_{counter}{path.suffix}"
        shutil.copy2(path, backup_path)

    # Rebuild the file with updated frontmatter
    new_post = frontmatter.Post(post.content, **meta)
    updated_text = frontmatter.dumps(new_post)
    path.write_text(updated_text, encoding="utf-8")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_migration(
    vault_path: Path,
    dry_run: bool = True,
    backup_dir: Path | None = None,
) -> dict:
    """Scan vault and migrate notes. Returns summary dict."""
    vault_path = vault_path.resolve()
    if not vault_path.is_dir():
        raise ValueError(f"Vault path is not a directory: {vault_path}")

    scanned = 0
    updated = 0
    skipped = 0
    errored = 0
    results: list[MigrationResult] = []

    for note in iter_vault_notes(vault_path, exclude_dirs=EXCLUDE_DIRS):
        scanned += 1
        result = analyse_note(note, vault_path)
        results.append(result)

        if result.error:
            errored += 1
        elif result.skipped:
            skipped += 1
        elif result.needs_update:
            if not dry_run:
                try:
                    apply_changes(note, result.changes, backup_dir)
                    updated += 1
                except Exception as exc:
                    result.error = str(exc)
                    errored += 1
            else:
                updated += 1  # count as "would update" in dry-run

    return {
        "scanned": scanned,
        "updated": updated,
        "skipped": skipped,
        "errored": errored,
        "dry_run": dry_run,
        "results": results,
    }


def _print_report(summary: dict, verbose: bool = False) -> None:
    """Print human-readable migration report to stdout."""
    dry = summary["dry_run"]
    mode = "[DRY RUN] " if dry else ""

    print(f"\n{mode}Vault Migration Report")
    print("=" * 50)
    print(f"  Files scanned : {summary['scanned']}")
    print(f"  {'Would update' if dry else 'Updated'}  : {summary['updated']}")
    print(f"  Skipped       : {summary['skipped']}")
    print(f"  Errors        : {summary['errored']}")
    print()

    results: list[MigrationResult] = summary["results"]

    if verbose or dry:
        for r in results:
            if r.error:
                print(f"  ERROR  {r.path.name}: {r.error}")
            elif r.skipped:
                print(f"  SKIP   {r.path.name}: {r.skip_reason}")
            elif r.changes:
                verb = "WOULD UPDATE" if dry else "UPDATED"
                print(f"  {verb}  {r.path.name}:")
                for c in r.changes:
                    print(f"           - {c.description}")

    if dry:
        print("\nRun without --dry-run to apply changes.")
    print()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Migrate an existing Obsidian genome vault to the current toolkit format.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--vault",
        required=True,
        type=Path,
        metavar="PATH",
        help="Path to the Obsidian vault root directory",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Report changes without writing files (default: True)",
    )
    parser.add_argument(
        "--no-dry-run",
        dest="dry_run",
        action="store_false",
        help="Apply changes to files (creates backups unless --backup-dir is disabled)",
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=None,
        metavar="DIR",
        help="Directory for file backups before modification (default: <vault>/.migration-backup)",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        default=False,
        help="Skip creating backups (dangerous — use with care)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        default=False,
        help="Show details for all files, not just changed ones",
    )

    args = parser.parse_args(argv)

    vault_path = args.vault.resolve()
    if not vault_path.is_dir():
        print(f"Error: vault path does not exist or is not a directory: {vault_path}", file=sys.stderr)
        return 1

    # Determine backup directory
    backup_dir: Path | None
    if args.dry_run or args.no_backup:
        backup_dir = None
    elif args.backup_dir is not None:
        backup_dir = args.backup_dir.resolve()
    else:
        backup_dir = vault_path / ".migration-backup"

    try:
        summary = run_migration(vault_path, dry_run=args.dry_run, backup_dir=backup_dir)
    except Exception as exc:
        print(f"Fatal error during migration: {exc}", file=sys.stderr)
        return 2

    _print_report(summary, verbose=args.verbose)

    if summary["errored"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
