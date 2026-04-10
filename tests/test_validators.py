"""Tests for validator wrappers in scripts/lib/validators/.

Each test verifies that the validator returns a correctly structured
AgentResult — status, flags list, summary string, duration_ms, and raw_output.
"""
from __future__ import annotations

import pytest

from scripts.lib.multi_agent import AgentResult, ValidationFlag, Severity
from scripts.lib.validators import codex_validate, pubmed_validate, notebooklm_validate
import scripts.lib.validators.codex_validator as codex_mod
import scripts.lib.validators.pubmed_validator as pubmed_mod
import scripts.lib.validators.notebooklm_validator as notebooklm_mod


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_CLAIM = "CYP2D6 poor metabolizers have 2-fold higher plasma levels of codeine metabolites."
SAMPLE_CONTEXT: dict = {
    "gene": "CYP2D6",
    "evidence_tier": "E2",
    "effect_size": 2.0,
    "citations": ["PMID:12345678"],
    "validation_type": "gene_note",
}


def _assert_agent_result_structure(result: AgentResult, expected_agent: str) -> None:
    """Assert that result has all required AgentResult fields with correct types."""
    assert isinstance(result, AgentResult), f"Expected AgentResult, got {type(result)}"
    assert result.agent == expected_agent, f"agent mismatch: {result.agent!r}"
    assert result.status in {"pass", "fail", "error", "timeout", "skipped"}, (
        f"Invalid status: {result.status!r}"
    )
    assert isinstance(result.flags, list), "flags must be a list"
    assert isinstance(result.summary, str), "summary must be a str"
    assert isinstance(result.duration_ms, int), "duration_ms must be an int"
    assert isinstance(result.raw_output, str), "raw_output must be a str"

    for flag in result.flags:
        assert isinstance(flag, ValidationFlag), f"flag must be ValidationFlag, got {type(flag)}"
        assert flag.severity in Severity, f"Invalid severity: {flag.severity!r}"
        assert isinstance(flag.agent, str) and flag.agent, "flag.agent must be non-empty str"
        assert isinstance(flag.claim, str), "flag.claim must be str"
        assert isinstance(flag.issue, str), "flag.issue must be str"
        assert isinstance(flag.suggestion, str), "flag.suggestion must be str"


# ---------------------------------------------------------------------------
# codex_validator
# ---------------------------------------------------------------------------

class TestCodexValidator:
    def test_returns_agent_result(self):
        result = codex_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        _assert_agent_result_structure(result, "codex")

    def test_status_is_pass_or_skipped(self):
        result = codex_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        # Without Codex CLI on PATH the stub returns "skipped"; with it "pass"
        assert result.status in {"pass", "skipped"}

    def test_skipped_when_codex_not_on_path(self, monkeypatch):
        monkeypatch.setattr("shutil.which", lambda _: None)
        result = codex_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert result.status == "skipped"
        assert result.flags == []
        assert result.summary != ""

    def test_duration_ms_is_non_negative(self):
        result = codex_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert result.duration_ms >= 0

    def test_empty_claim_handled(self):
        result = codex_validate("", {})
        _assert_agent_result_structure(result, "codex")

    def test_build_prompt_includes_claim(self):
        prompt = codex_mod._build_prompt(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert SAMPLE_CLAIM in prompt
        assert "E2" in prompt
        assert "CYP2D6" in prompt

    def test_build_prompt_without_optional_fields(self):
        prompt = codex_mod._build_prompt("some claim", {})
        assert "some claim" in prompt


# ---------------------------------------------------------------------------
# pubmed_validator
# ---------------------------------------------------------------------------

class TestPubMedValidator:
    def test_returns_agent_result(self):
        result = pubmed_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        _assert_agent_result_structure(result, "pubmed")

    def test_status_is_pass_or_error(self):
        result = pubmed_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert result.status in {"pass", "fail", "error", "skipped"}

    def test_stub_returns_pass(self):
        result = pubmed_mod._stub_search(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert result.status == "pass"
        assert result.flags == []

    def test_duration_ms_set_by_validate(self):
        result = pubmed_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert result.duration_ms >= 0

    def test_build_query_includes_gene(self):
        query = pubmed_mod._build_query(SAMPLE_CLAIM, {"gene": "CYP2D6"})
        assert "CYP2D6" in query

    def test_build_query_without_gene(self):
        query = pubmed_mod._build_query("some claim", {})
        assert "some claim" in query

    def test_exception_returns_error_status(self, monkeypatch):
        def bad_stub(claim, context):
            raise RuntimeError("network unreachable")

        monkeypatch.setattr(pubmed_mod, "_stub_search", bad_stub)
        result = pubmed_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert result.status == "error"
        assert "network unreachable" in result.summary


# ---------------------------------------------------------------------------
# notebooklm_validator
# ---------------------------------------------------------------------------

class TestNotebookLMValidator:
    def test_returns_agent_result(self):
        result = notebooklm_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        _assert_agent_result_structure(result, "notebooklm")

    def test_skipped_when_skill_missing(self, tmp_path, monkeypatch):
        monkeypatch.setattr(notebooklm_mod, "_SKILLS_DIR", tmp_path)
        result = notebooklm_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert result.status == "skipped"
        assert result.flags == []
        assert "skill not found" in result.summary.lower() or "not found" in result.summary.lower()

    def test_skipped_with_warn_flag_when_no_pdfs(self, tmp_path, monkeypatch):
        # Simulate skill directory existing but no PDFs in context
        skill_dir = tmp_path / notebooklm_mod._SKILL_NAME
        skill_dir.mkdir()
        monkeypatch.setattr(notebooklm_mod, "_SKILLS_DIR", tmp_path)

        result = notebooklm_validate(SAMPLE_CLAIM, {})
        assert result.status == "skipped"
        assert len(result.flags) == 1
        assert result.flags[0].severity == Severity.WARN

    def test_pass_when_skill_and_pdfs_present(self, tmp_path, monkeypatch):
        skill_dir = tmp_path / notebooklm_mod._SKILL_NAME
        skill_dir.mkdir()
        monkeypatch.setattr(notebooklm_mod, "_SKILLS_DIR", tmp_path)

        ctx = {**SAMPLE_CONTEXT, "source_pdfs": ["/fake/paper.pdf"]}
        result = notebooklm_validate(SAMPLE_CLAIM, ctx)
        # Stub returns "pass" when skill dir exists and PDFs are provided
        assert result.status == "pass"

    def test_duration_ms_non_negative(self):
        result = notebooklm_validate(SAMPLE_CLAIM, SAMPLE_CONTEXT)
        assert result.duration_ms >= 0


# ---------------------------------------------------------------------------
# __init__ re-exports
# ---------------------------------------------------------------------------

class TestValidatorsInit:
    def test_codex_validate_exported(self):
        from scripts.lib.validators import codex_validate as cv
        assert callable(cv)

    def test_pubmed_validate_exported(self):
        from scripts.lib.validators import pubmed_validate as pv
        assert callable(pv)

    def test_notebooklm_validate_exported(self):
        from scripts.lib.validators import notebooklm_validate as nv
        assert callable(nv)
