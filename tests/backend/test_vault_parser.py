"""Tests for backend.app.vault_parser — gene note parsing and category derivation."""
import pytest
from backend.app.vault_parser import parse_gene_note


def _yaml_list(key: str, values: list[str]) -> str:
    if not values:
        return f"{key}: []\n"
    # Quote each value to avoid YAML parsing issues with [[ ]] characters
    items = "\n".join(f'  - "{v}"' for v in values)
    return f"{key}:\n{items}\n"


def make_note(systems=None, tags=None, personal_status="risk", extra_fm=""):
    systems_yaml = _yaml_list("systems", systems) if systems is not None else ""
    tags_yaml = _yaml_list("tags", tags) if tags is not None else ""
    return f"""---
gene_symbol: TEST
personal_status: {personal_status}
{systems_yaml}{tags_yaml}{extra_fm}---
# TEST
"""


class TestCategoryDerivation:
    def test_methylation_maps_to_mood(self):
        result = parse_gene_note(make_note(systems=["Methylation Pathway"]))
        assert "mood" in result["categories"]

    def test_serotonin_maps_to_mood(self):
        result = parse_gene_note(make_note(systems=["Serotonin System"]))
        assert "mood" in result["categories"]

    def test_gaba_maps_to_sleep(self):
        result = parse_gene_note(make_note(systems=["GABA System"]))
        assert "sleep" in result["categories"]

    def test_sleep_architecture_maps_to_sleep(self):
        result = parse_gene_note(make_note(systems=["Sleep Architecture"]))
        assert "sleep" in result["categories"]

    def test_stress_response_maps_to_stress(self):
        result = parse_gene_note(make_note(systems=["Stress Response"]))
        assert "stress" in result["categories"]

    def test_hpa_axis_maps_to_stress(self):
        result = parse_gene_note(make_note(systems=["HPA Axis"]))
        assert "stress" in result["categories"]

    def test_dopamine_maps_to_focus(self):
        result = parse_gene_note(make_note(systems=["Dopamine System"]))
        assert "focus" in result["categories"]

    def test_wikilink_systems_are_stripped(self):
        result = parse_gene_note(make_note(systems=["[[Methylation Pathway]]"]))
        assert "mood" in result["categories"]

    def test_multi_system_gene_gets_multiple_categories(self):
        result = parse_gene_note(make_note(systems=["GABA System", "Stress Response"]))
        assert "sleep" in result["categories"]
        assert "stress" in result["categories"]

    def test_unrecognized_systems_default_to_mood(self):
        result = parse_gene_note(make_note(systems=["Liver and Metabolism"]))
        assert result["categories"] == ["mood"]

    def test_empty_systems_default_to_mood(self):
        result = parse_gene_note(make_note(systems=[]))
        assert result["categories"] == ["mood"]

    def test_tag_anxiety_maps_to_stress(self):
        result = parse_gene_note(make_note(systems=[], tags=["anxiety"]))
        assert "stress" in result["categories"]

    def test_tag_depression_maps_to_mood(self):
        result = parse_gene_note(make_note(systems=[], tags=["depression"]))
        assert "mood" in result["categories"]

    def test_tag_adhd_maps_to_focus(self):
        result = parse_gene_note(make_note(systems=[], tags=["adhd"]))
        assert "focus" in result["categories"]

    def test_tag_insomnia_maps_to_sleep(self):
        result = parse_gene_note(make_note(systems=[], tags=["insomnia"]))
        assert "sleep" in result["categories"]

    def test_no_duplicate_categories(self):
        # Both "Serotonin" and "Methylation" → mood; should only appear once
        result = parse_gene_note(make_note(systems=["Serotonin System", "Methylation Pathway"]))
        assert result["categories"].count("mood") == 1
