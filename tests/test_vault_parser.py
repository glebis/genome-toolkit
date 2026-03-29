"""Tests for the unified Obsidian vault parser."""
import pytest
from datetime import date
from pathlib import Path

from lib.vault_parser import (
    parse_note, iter_vault_notes, get_link_list, clean_yaml_wikilinks,
    parse_date, clear_cache, ObsidianLink, WIKILINK_RE, DATAVIEW_INLINE_RE,
)


class TestParseNote:
    """Test single note parsing."""

    def test_parse_gene_note(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")

        assert note.name == "gene_bdnf"
        assert note.frontmatter_valid is True
        assert len(note.warnings) == 0

    def test_frontmatter_extraction(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")
        fm = note.frontmatter

        assert fm["type"] == "gene"
        assert fm["gene_symbol"] == "BDNF"
        assert fm["full_name"] == "Brain-Derived Neurotrophic Factor"
        assert fm["chromosome"] == "11"
        assert fm["evidence_tier"] == "E1"
        assert fm["personal_status"] == "optimal"

    def test_systems_as_wikilinks(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")
        fm = note.frontmatter

        # Raw value should contain wikilinks
        assert "[[Stress Response]]" in fm["systems"][0]

    def test_personal_variants_nested(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")
        variants = note.frontmatter["personal_variants"]

        assert len(variants) == 1
        assert variants[0]["rsid"] == "rs6265"
        assert variants[0]["genotype"] == "C;C"
        assert variants[0]["evidence_tier"] == "E1"

    def test_body_wikilinks(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")

        targets = [wl.target for wl in note.wikilinks]
        assert "FKBP5" in targets
        assert "DRD2" in targets
        assert "Genetic Determinism - Limits and Caveats" in targets

    def test_embeds(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")
        # This note has no embeds
        assert len(note.embeds) == 0

    def test_sections(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")

        assert "What This Gene Does" in note.sections
        assert "Personal Genotype" in note.sections
        assert "Health Relevance" in note.sections
        assert "Drug Interactions" in note.sections
        assert "Gene-Gene Interactions" in note.sections
        assert "What Changes This" in note.sections
        assert "Confidence & Caveats" in note.sections
        assert "Sources" in note.sections

    def test_dataview_inline_fields(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")

        assert "priority" in note.dataview_fields
        assert "high" in note.dataview_fields["priority"]
        assert "context" in note.dataview_fields
        assert "research" in note.dataview_fields["context"]

    def test_tags(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")

        assert "gene" in note.tags
        assert "neuroplasticity" in note.tags

    def test_malformed_frontmatter(self, vault_notes_dir):
        """Note with wikilink date should parse without error."""
        note = parse_note(vault_notes_dir / "research_broken_fm.md")
        assert note.frontmatter_valid is True
        assert note.frontmatter["created_date"] == "[[20260325]]"


class TestGetLinkList:
    """Test wikilink extraction from frontmatter values."""

    def test_extract_systems(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")
        links = get_link_list(note, "systems")

        assert len(links) == 2
        targets = [l.target for l in links]
        assert "Stress Response" in targets
        assert "Behavioral Architecture" in targets

    def test_extract_from_string_field(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")
        links = get_link_list(note, "brain_vault_link")

        assert len(links) == 1
        assert links[0].target == "BDNF"

    def test_missing_field_returns_empty(self, vault_notes_dir):
        note = parse_note(vault_notes_dir / "gene_bdnf.md")
        links = get_link_list(note, "nonexistent_field")
        assert links == []


class TestCleanYamlWikilinks:
    """Test wikilink stripping from YAML values."""

    def test_clean_string(self):
        assert clean_yaml_wikilinks("[[Dopamine System]]") == "Dopamine System"

    def test_clean_list(self):
        result = clean_yaml_wikilinks(["[[Stress Response]]", "[[Dopamine System]]"])
        assert result == ["Stress Response", "Dopamine System"]

    def test_clean_nested_dict(self):
        result = clean_yaml_wikilinks({"system": "[[HPA Axis]]", "genes": ["[[FKBP5]]"]})
        assert result == {"system": "HPA Axis", "genes": ["FKBP5"]}

    def test_clean_with_alias(self):
        assert clean_yaml_wikilinks("[[Lipid Metabolism|Cardiovascular/Lipid]]") == "Lipid Metabolism"

    def test_passthrough_non_wikilink(self):
        assert clean_yaml_wikilinks("plain text") == "plain text"
        assert clean_yaml_wikilinks(42) == 42
        assert clean_yaml_wikilinks(None) is None


class TestParseDate:
    """Test date normalization from various Obsidian formats."""

    def test_iso_string(self):
        assert parse_date("2026-03-25") == date(2026, 3, 25)

    def test_iso_quoted(self):
        assert parse_date("'2026-03-25'") == date(2026, 3, 25)

    def test_wikilink_compact(self):
        assert parse_date("[[20260325]]") == date(2026, 3, 25)

    def test_wikilink_compact_quoted(self):
        assert parse_date("'[[20260325]]'") == date(2026, 3, 25)

    def test_wikilink_iso(self):
        assert parse_date("[[2026-03-25]]") == date(2026, 3, 25)

    def test_bare_compact(self):
        assert parse_date("20260325") == date(2026, 3, 25)

    def test_python_date_passthrough(self):
        d = date(2026, 3, 25)
        assert parse_date(d) == d

    def test_none_returns_none(self):
        assert parse_date(None) is None

    def test_invalid_returns_none(self):
        assert parse_date("not a date") is None
        assert parse_date("") is None


class TestWikilinkRegex:
    """Test the wikilink regex pattern directly."""

    def test_basic_link(self):
        m = WIKILINK_RE.search("See [[BDNF]] for details")
        assert m.group(2) == "BDNF"

    def test_aliased_link(self):
        m = WIKILINK_RE.search("See [[Lipid Metabolism|Cardiovascular]]")
        assert m.group(2) == "Lipid Metabolism"
        assert m.group(4) == "Cardiovascular"

    def test_heading_link(self):
        m = WIKILINK_RE.search("See [[BDNF#What Changes This]]")
        assert m.group(2) == "BDNF"
        assert m.group(3) == "What Changes This"

    def test_embed(self):
        m = WIKILINK_RE.search("![[image.png]]")
        assert m.group(1) == "!"
        assert m.group(2) == "image.png"

    def test_multiple_links(self):
        text = "[[FKBP5]] interacts with [[DRD2]] and [[BDNF]]"
        matches = WIKILINK_RE.findall(text)
        assert len(matches) == 3


class TestDataviewInlineRegex:
    """Test Dataview inline field extraction."""

    def test_basic_field(self):
        m = DATAVIEW_INLINE_RE.search("[priority:: high]")
        assert m.group(1) == "priority"
        assert m.group(2) == "high"

    def test_date_field(self):
        m = DATAVIEW_INLINE_RE.search("[due:: 2026-04-15]")
        assert m.group(1) == "due"
        assert m.group(2) == "2026-04-15"

    def test_context_field(self):
        m = DATAVIEW_INLINE_RE.search("[context:: prescriber]")
        assert m.group(1) == "context"
        assert m.group(2) == "prescriber"


class TestCache:
    """Test per-process caching."""

    def test_cache_hit(self, vault_notes_dir):
        clear_cache()
        path = vault_notes_dir / "gene_bdnf.md"

        note1 = parse_note(path, use_cache=True)
        note2 = parse_note(path, use_cache=True)
        assert note1 is note2  # same object from cache

    def test_cache_bypass(self, vault_notes_dir):
        clear_cache()
        path = vault_notes_dir / "gene_bdnf.md"

        note1 = parse_note(path, use_cache=False)
        note2 = parse_note(path, use_cache=False)
        assert note1 is not note2  # different objects

    def test_clear_cache(self, vault_notes_dir):
        path = vault_notes_dir / "gene_bdnf.md"
        parse_note(path, use_cache=True)
        clear_cache()
        # After clearing, should create new object
        note = parse_note(path, use_cache=True)
        assert note is not None
