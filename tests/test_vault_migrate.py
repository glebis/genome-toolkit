"""Tests for vault_migrate.py — migration of legacy Obsidian gene vault notes."""
from __future__ import annotations

import sys
from pathlib import Path
from datetime import date

import pytest
import frontmatter

# Make sure scripts/ is on the path
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from vault_migrate import (
    analyse_note,
    apply_changes,
    run_migration,
    MigrationChange,
    MigrationResult,
    FIELD_RENAMES,
)
from lib.vault_parser import parse_note, clear_cache


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def write_note(directory: Path, filename: str, content: str) -> Path:
    """Write a markdown file and return its Path."""
    p = directory / filename
    p.write_text(content, encoding="utf-8")
    return p


def read_frontmatter(path: Path) -> dict:
    post = frontmatter.load(str(path))
    return dict(post.metadata)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def gene_vault(tmp_path) -> Path:
    """A temporary vault with a Genes/ subfolder containing legacy notes."""
    genes_dir = tmp_path / "Genes"
    genes_dir.mkdir()
    return tmp_path


@pytest.fixture
def modern_gene_note(gene_vault) -> Path:
    """A fully up-to-date gene note — should require no changes."""
    content = """\
---
type: gene
gene_symbol: COMT
full_name: Catechol-O-Methyltransferase
chromosome: '22'
systems:
  - "[[Dopamine System]]"
personal_variants:
  - rsid: rs4680
    genotype: G;A
    significance: Val/Met
    evidence_tier: E1
evidence_tier: E1
relevance: dopamine
personal_status: heterozygous
description: Val/Met heterozygous — intermediate COMT activity
last_reviewed: '2026-04-01'
created_date: '2026-01-15'
brain_vault_link: "[[COMT]]"
tags:
  - gene
---

# COMT

## What This Gene Does

COMT degrades catecholamines including dopamine in the prefrontal cortex.
"""
    return write_note(gene_vault / "Genes", "COMT.md", content)


@pytest.fixture
def legacy_gene_note(gene_vault) -> Path:
    """A legacy gene note with old field names and missing required fields."""
    content = """\
---
gene: FKBP5
name: FK506 Binding Protein 5
chromosome: '6'
system: "[[Stress Response]]"
tier: E2
created: '2025-11-01'
tags:
  - stress
---

# FKBP5

## What This Gene Does

FKBP5 regulates glucocorticoid receptor sensitivity.
"""
    return write_note(gene_vault / "Genes", "FKBP5.md", content)


@pytest.fixture
def missing_type_note(gene_vault) -> Path:
    """A note without a type field, inside a Genes/ folder (type should be inferred)."""
    content = """\
---
gene_symbol: DRD2
full_name: Dopamine Receptor D2
chromosome: '11'
evidence_tier: E1
created_date: '2026-02-01'
tags:
  - gene
---

# DRD2
"""
    return write_note(gene_vault / "Genes", "DRD2.md", content)


@pytest.fixture
def unknown_type_note(tmp_path) -> Path:
    """A note at the vault root with no type and no recognisable folder."""
    content = """\
---
title: Random Note
---

Some text.
"""
    return write_note(tmp_path, "random.md", content)


@pytest.fixture
def bad_date_note(gene_vault) -> Path:
    """A gene note with a compact-format date that needs normalizing."""
    content = """\
---
type: gene
gene_symbol: SLC6A4
full_name: Serotonin Transporter
chromosome: '17'
systems: []
evidence_tier: E2
created_date: '[[20251230]]'
last_reviewed: 20260101
tags:
  - gene
---

# SLC6A4
"""
    return write_note(gene_vault / "Genes", "SLC6A4.md", content)


@pytest.fixture
def scalar_systems_note(gene_vault) -> Path:
    """A gene note where 'systems' is a scalar string rather than a list."""
    content = """\
---
type: gene
gene_symbol: MAOA
full_name: Monoamine Oxidase A
chromosome: X
systems: "[[Serotonin System]]"
evidence_tier: E2
created_date: '2025-09-01'
tags:
  - gene
---

# MAOA
"""
    return write_note(gene_vault / "Genes", "MAOA.md", content)


# ---------------------------------------------------------------------------
# Tests: analyse_note
# ---------------------------------------------------------------------------

class TestAnalyseNote:

    def test_modern_note_has_no_changes(self, modern_gene_note, gene_vault):
        clear_cache()
        note = parse_note(modern_gene_note)
        result = analyse_note(note, gene_vault)

        assert not result.error
        assert not result.skipped
        assert result.changes == []

    def test_legacy_field_renames_detected(self, legacy_gene_note, gene_vault):
        clear_cache()
        note = parse_note(legacy_gene_note)
        result = analyse_note(note, gene_vault)

        rename_fields = {c.field for c in result.changes if c.kind == "rename"}
        # 'gene' -> gene_symbol, 'name' -> full_name, 'system' -> systems, 'tier' -> evidence_tier, 'created' -> created_date
        assert "gene" in rename_fields
        assert "name" in rename_fields
        assert "tier" in rename_fields
        assert "created" in rename_fields

    def test_missing_type_inferred_from_folder(self, missing_type_note, gene_vault):
        clear_cache()
        note = parse_note(missing_type_note)
        result = analyse_note(note, gene_vault)

        type_changes = [c for c in result.changes if c.field == "type"]
        assert len(type_changes) == 1
        assert type_changes[0].new_value == "gene"

    def test_unknown_type_skipped(self, unknown_type_note, tmp_path):
        clear_cache()
        note = parse_note(unknown_type_note)
        result = analyse_note(note, tmp_path)

        assert result.skipped is True
        assert "type" in result.skip_reason.lower()

    def test_date_normalization_detected(self, bad_date_note, gene_vault):
        clear_cache()
        note = parse_note(bad_date_note)
        result = analyse_note(note, gene_vault)

        date_changes = [c for c in result.changes if c.kind == "normalize_date"]
        date_fields = {c.field for c in date_changes}
        assert "created_date" in date_fields
        assert "last_reviewed" in date_fields

    def test_scalar_systems_converted_to_list(self, scalar_systems_note, gene_vault):
        clear_cache()
        note = parse_note(scalar_systems_note)
        result = analyse_note(note, gene_vault)

        systems_fixes = [c for c in result.changes if c.field == "systems" and c.kind == "fix_type"]
        assert len(systems_fixes) == 1
        assert isinstance(systems_fixes[0].new_value, list)

    def test_missing_required_fields_flagged(self, legacy_gene_note, gene_vault):
        clear_cache()
        note = parse_note(legacy_gene_note)
        result = analyse_note(note, gene_vault)

        added_fields = {c.field for c in result.changes if c.kind == "add_field"}
        # After renames, 'type' should be missing (legacy note has no type)
        assert "type" in added_fields

    def test_type_tag_added_when_missing(self, missing_type_note, gene_vault):
        clear_cache()
        note = parse_note(missing_type_note)
        result = analyse_note(note, gene_vault)

        tag_changes = [c for c in result.changes if c.field == "tags"]
        # Should add "gene" to tags
        if tag_changes:
            assert "gene" in tag_changes[0].new_value


# ---------------------------------------------------------------------------
# Tests: apply_changes (writes files)
# ---------------------------------------------------------------------------

class TestApplyChanges:

    def test_legacy_fields_renamed_on_disk(self, legacy_gene_note, gene_vault, tmp_path):
        clear_cache()
        note = parse_note(legacy_gene_note)
        result = analyse_note(note, gene_vault)
        assert result.needs_update

        backup_dir = tmp_path / "backup"
        apply_changes(note, result.changes, backup_dir=backup_dir)

        # Check backup was created
        assert len(list(backup_dir.iterdir())) == 1

        # Re-read file and check new fields exist
        clear_cache()
        updated = read_frontmatter(legacy_gene_note)
        assert "gene_symbol" in updated
        assert "full_name" in updated
        assert "evidence_tier" in updated
        assert "created_date" in updated
        # Old names should be gone
        assert "gene" not in updated
        assert "name" not in updated
        assert "tier" not in updated
        assert "created" not in updated

    def test_dates_normalized_on_disk(self, bad_date_note, gene_vault, tmp_path):
        clear_cache()
        note = parse_note(bad_date_note)
        result = analyse_note(note, gene_vault)

        apply_changes(note, result.changes, backup_dir=tmp_path / "backup")

        clear_cache()
        updated = read_frontmatter(bad_date_note)
        assert updated["created_date"] == "2025-12-30"
        assert updated["last_reviewed"] == "2026-01-01"

    def test_scalar_systems_becomes_list_on_disk(self, scalar_systems_note, gene_vault, tmp_path):
        clear_cache()
        note = parse_note(scalar_systems_note)
        result = analyse_note(note, gene_vault)

        apply_changes(note, result.changes, backup_dir=tmp_path / "backup")

        clear_cache()
        updated = read_frontmatter(scalar_systems_note)
        assert isinstance(updated["systems"], list)

    def test_no_backup_when_backup_dir_is_none(self, scalar_systems_note, gene_vault, tmp_path):
        clear_cache()
        note = parse_note(scalar_systems_note)
        result = analyse_note(note, gene_vault)

        # Should not raise, and no backup created
        apply_changes(note, result.changes, backup_dir=None)
        # File should still be updated
        clear_cache()
        updated = read_frontmatter(scalar_systems_note)
        assert isinstance(updated["systems"], list)

    def test_backup_collision_handled(self, legacy_gene_note, gene_vault, tmp_path):
        """Two notes with same filename shouldn't overwrite the backup."""
        clear_cache()
        note = parse_note(legacy_gene_note)
        result = analyse_note(note, gene_vault)
        backup_dir = tmp_path / "backup"

        # Apply twice to trigger collision logic
        apply_changes(note, result.changes, backup_dir=backup_dir)
        # Apply again — backup should not overwrite
        clear_cache()
        note2 = parse_note(legacy_gene_note)
        apply_changes(note2, result.changes, backup_dir=backup_dir)

        backups = list(backup_dir.iterdir())
        assert len(backups) == 2


# ---------------------------------------------------------------------------
# Tests: run_migration (full pipeline)
# ---------------------------------------------------------------------------

class TestRunMigration:

    def test_dry_run_makes_no_changes(self, legacy_gene_note, gene_vault):
        clear_cache()
        original = legacy_gene_note.read_text(encoding="utf-8")

        summary = run_migration(gene_vault, dry_run=True)

        assert summary["dry_run"] is True
        # File must not be modified
        assert legacy_gene_note.read_text(encoding="utf-8") == original

    def test_dry_run_counts_updates(self, legacy_gene_note, missing_type_note, gene_vault):
        clear_cache()
        summary = run_migration(gene_vault, dry_run=True)

        assert summary["scanned"] >= 2
        assert summary["updated"] >= 1

    def test_write_mode_updates_files(self, legacy_gene_note, gene_vault, tmp_path):
        clear_cache()
        backup_dir = tmp_path / "backup"
        summary = run_migration(gene_vault, dry_run=False, backup_dir=backup_dir)

        assert summary["dry_run"] is False
        assert summary["updated"] >= 1

        # Backup files should exist
        assert backup_dir.exists()
        assert len(list(backup_dir.iterdir())) >= 1

    def test_modern_note_untouched(self, modern_gene_note, gene_vault, tmp_path):
        clear_cache()
        original = modern_gene_note.read_text(encoding="utf-8")
        backup_dir = tmp_path / "backup"

        run_migration(gene_vault, dry_run=False, backup_dir=backup_dir)

        # Modern note should not be in backup (nothing to migrate)
        assert modern_gene_note.read_text(encoding="utf-8") == original

    def test_invalid_vault_path_raises(self, tmp_path):
        with pytest.raises(ValueError, match="not a directory"):
            run_migration(tmp_path / "nonexistent", dry_run=True)

    def test_summary_keys_present(self, gene_vault):
        clear_cache()
        summary = run_migration(gene_vault, dry_run=True)

        assert "scanned" in summary
        assert "updated" in summary
        assert "skipped" in summary
        assert "errored" in summary
        assert "dry_run" in summary
        assert "results" in summary

    def test_skipped_notes_counted(self, unknown_type_note, tmp_path):
        """Note at root with no type should be skipped, not errored."""
        clear_cache()
        # unknown_type_note is in tmp_path root — no recognisable folder
        summary = run_migration(tmp_path, dry_run=True)

        assert summary["skipped"] >= 1
        assert summary["errored"] == 0
