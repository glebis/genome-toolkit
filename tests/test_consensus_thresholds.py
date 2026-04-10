"""Tests for warn_on and tolerance threshold logic in compute_consensus().

Covers:
- warn_on types: BLOCK flags whose issue is in warn_on are demoted to WARN
- warn_on types: existing WARN flags with warn_on issues get human warning messages
- effect_size_tolerance: BLOCK flags for 'effect_size_mismatch' within tolerance
  are demoted to WARN; those outside tolerance stay as BLOCK
- evidence_tier_tolerance: BLOCK flags for 'wrong_evidence_tier' within tolerance
  are demoted to WARN; those outside tolerance stay as BLOCK
- warnings field on ConsensusResult is populated correctly
"""
import sys
from pathlib import Path

import pytest

# Ensure scripts/ is on path (mirrors conftest.py)
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from lib.multi_agent import (  # noqa: E402
    AgentResult,
    ConsensusResult,
    Severity,
    ValidationFlag,
    compute_consensus,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_flag(
    issue: str,
    severity: Severity = Severity.BLOCK,
    agent: str = "codex",
    claim: str = "test claim",
    suggestion: str = "fix it",
    evidence: str | None = None,
) -> ValidationFlag:
    return ValidationFlag(
        severity=severity,
        agent=agent,
        claim=claim,
        issue=issue,
        suggestion=suggestion,
        evidence=evidence,
    )


def make_result(
    status: str = "pass",
    flags: list[ValidationFlag] | None = None,
    agent: str = "codex",
) -> AgentResult:
    return AgentResult(agent=agent, status=status, flags=flags or [])


GENE_NOTE_GATE = {
    "required_agents": 1,
    "timeout_minutes": 10,
    "block_on": [
        "effect_size_mismatch",
        "wrong_evidence_tier",
        "missing_drug_interaction",
    ],
    "warn_on": [
        "stale_sources",
        "single_study_claim",
    ],
}

PRESCRIBER_GATE = {
    "required_agents": 2,
    "timeout_minutes": 15,
    "block_on": [
        "drug_contraindication_error",
        "dosing_error",
        "missing_safety_warning",
        "wrong_metabolizer_phenotype",
    ],
    "warn_on": [
        "incomplete_drug_list",
        "missing_monitoring_recommendation",
    ],
}

CONSENSUS_CONFIG = {
    "effect_size_tolerance": 0.2,
    "evidence_tier_tolerance": 1,
    "drug_interaction_strict": True,
    "require_human_for_blocks": True,
}


# ---------------------------------------------------------------------------
# warn_on tests
# ---------------------------------------------------------------------------

class TestWarnOn:
    def test_block_flag_with_warn_on_issue_is_demoted_to_warn(self):
        """A BLOCK flag whose issue is in gate.warn_on should be demoted to WARN."""
        flag = make_flag(issue="stale_sources", severity=Severity.BLOCK)
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 0, "Flag should not remain as BLOCK"
        assert len(consensus.warning_flags) == 1
        assert consensus.warning_flags[0].issue == "stale_sources"
        assert consensus.warning_flags[0].severity == Severity.WARN

    def test_warn_on_demotion_allows_pass(self):
        """Demoting a warn_on BLOCK flag should allow the run to pass."""
        flag = make_flag(issue="stale_sources", severity=Severity.BLOCK)
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert consensus.passed is True

    def test_warn_on_flag_adds_human_warning_message(self):
        """warn_on flag should produce a human-readable entry in consensus.warnings."""
        flag = make_flag(issue="stale_sources", severity=Severity.BLOCK)
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.warnings) == 1
        assert "stale_sources" in consensus.warnings[0]
        assert "codex" in consensus.warnings[0]

    def test_existing_warn_flag_with_warn_on_issue_gets_human_warning(self):
        """An existing WARN flag whose issue is in warn_on should also emit a human warning."""
        flag = make_flag(issue="single_study_claim", severity=Severity.WARN)
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.warning_flags) == 1
        assert any("single_study_claim" in w for w in consensus.warnings)

    def test_block_flag_not_in_warn_on_remains_blocking(self):
        """A BLOCK flag whose issue is NOT in warn_on should remain blocking."""
        flag = make_flag(issue="missing_drug_interaction", severity=Severity.BLOCK)
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 1
        assert consensus.passed is False

    def test_multiple_warn_on_flags_all_demoted(self):
        flags = [
            make_flag(issue="stale_sources", severity=Severity.BLOCK),
            make_flag(issue="single_study_claim", severity=Severity.BLOCK),
        ]
        results = {"codex": make_result(status="pass", flags=flags)}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 0
        assert len(consensus.warning_flags) == 2
        assert len(consensus.warnings) == 2
        assert consensus.passed is True


# ---------------------------------------------------------------------------
# effect_size_tolerance tests
# ---------------------------------------------------------------------------

class TestEffectSizeTolerance:
    def test_effect_size_within_tolerance_is_demoted(self):
        """effect_size_mismatch with delta within 20% tolerance becomes WARN."""
        flag = make_flag(
            issue="effect_size_mismatch",
            severity=Severity.BLOCK,
            evidence="delta=0.15",  # 15% < 20% tolerance
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 0
        assert len(consensus.warning_flags) == 1
        assert consensus.passed is True
        assert any("effect_size_mismatch" in w for w in consensus.warnings)

    def test_effect_size_at_tolerance_boundary_is_demoted(self):
        """delta exactly at tolerance (0.2) should be demoted."""
        flag = make_flag(
            issue="effect_size_mismatch",
            severity=Severity.BLOCK,
            evidence="delta=0.2",
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert consensus.passed is True
        assert len(consensus.blocking_flags) == 0

    def test_effect_size_exceeding_tolerance_remains_blocking(self):
        """delta > 20% tolerance should remain a BLOCK."""
        flag = make_flag(
            issue="effect_size_mismatch",
            severity=Severity.BLOCK,
            evidence="delta=0.25",  # 25% > 20%
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 1
        assert consensus.passed is False

    def test_effect_size_negative_delta_within_tolerance(self):
        """Negative delta within tolerance should also be demoted."""
        flag = make_flag(
            issue="effect_size_mismatch",
            severity=Severity.BLOCK,
            evidence="delta=-0.10",
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert consensus.passed is True

    def test_effect_size_no_evidence_stays_blocking(self):
        """effect_size_mismatch with no delta evidence stays blocking (conservative)."""
        flag = make_flag(
            issue="effect_size_mismatch",
            severity=Severity.BLOCK,
            evidence=None,
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 1
        assert consensus.passed is False

    def test_custom_effect_size_tolerance(self):
        """Custom tolerance in consensus_config is respected."""
        flag = make_flag(
            issue="effect_size_mismatch",
            severity=Severity.BLOCK,
            evidence="delta=0.30",  # 30%
        )
        results = {"codex": make_result(status="pass", flags=[flag])}
        custom_config = {**CONSENSUS_CONFIG, "effect_size_tolerance": 0.35}

        consensus = compute_consensus(results, GENE_NOTE_GATE, custom_config)

        assert consensus.passed is True  # 30% < 35% custom tolerance


# ---------------------------------------------------------------------------
# evidence_tier_tolerance tests
# ---------------------------------------------------------------------------

class TestEvidenceTierTolerance:
    def test_tier_diff_within_tolerance_is_demoted(self):
        """wrong_evidence_tier with tier_diff=1 (within tolerance of 1) becomes WARN."""
        flag = make_flag(
            issue="wrong_evidence_tier",
            severity=Severity.BLOCK,
            evidence="tier_diff=1",
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 0
        assert len(consensus.warning_flags) == 1
        assert consensus.passed is True
        assert any("wrong_evidence_tier" in w for w in consensus.warnings)

    def test_tier_diff_zero_is_demoted(self):
        flag = make_flag(
            issue="wrong_evidence_tier",
            severity=Severity.BLOCK,
            evidence="tier_diff=0",
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert consensus.passed is True

    def test_tier_diff_exceeding_tolerance_remains_blocking(self):
        """tier_diff=2 exceeds tolerance of 1 and should remain BLOCK."""
        flag = make_flag(
            issue="wrong_evidence_tier",
            severity=Severity.BLOCK,
            evidence="tier_diff=2",
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 1
        assert consensus.passed is False

    def test_tier_diff_no_evidence_stays_blocking(self):
        flag = make_flag(
            issue="wrong_evidence_tier",
            severity=Severity.BLOCK,
            evidence=None,
        )
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 1
        assert consensus.passed is False

    def test_custom_tier_tolerance(self):
        flag = make_flag(
            issue="wrong_evidence_tier",
            severity=Severity.BLOCK,
            evidence="tier_diff=3",
        )
        results = {"codex": make_result(status="pass", flags=[flag])}
        custom_config = {**CONSENSUS_CONFIG, "evidence_tier_tolerance": 3}

        consensus = compute_consensus(results, GENE_NOTE_GATE, custom_config)

        assert consensus.passed is True


# ---------------------------------------------------------------------------
# Combined / integration tests
# ---------------------------------------------------------------------------

class TestCombinedThresholds:
    def test_warnings_field_empty_when_no_warn_triggers(self):
        results = {"codex": make_result(status="pass")}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert consensus.warnings == []

    def test_mix_of_demoted_and_real_blocks(self):
        """One flag demoted by tolerance, one remains blocking."""
        flags = [
            make_flag(
                issue="effect_size_mismatch",
                severity=Severity.BLOCK,
                evidence="delta=0.10",  # within tolerance -> WARN
            ),
            make_flag(
                issue="missing_drug_interaction",
                severity=Severity.BLOCK,
                evidence=None,  # remains BLOCK
            ),
        ]
        results = {"codex": make_result(status="pass", flags=flags)}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert len(consensus.blocking_flags) == 1
        assert consensus.blocking_flags[0].issue == "missing_drug_interaction"
        assert len(consensus.warning_flags) == 1
        assert consensus.passed is False

    def test_all_thresholds_together_pass(self):
        """All three kinds of tolerance/warn_on all trigger: should pass."""
        flags = [
            make_flag(
                issue="effect_size_mismatch",
                severity=Severity.BLOCK,
                evidence="delta=0.15",
            ),
            make_flag(
                issue="wrong_evidence_tier",
                severity=Severity.BLOCK,
                evidence="tier_diff=1",
            ),
            make_flag(issue="stale_sources", severity=Severity.BLOCK),
        ]
        results = {"codex": make_result(status="pass", flags=flags)}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert consensus.passed is True
        assert len(consensus.blocking_flags) == 0
        assert len(consensus.warning_flags) == 3
        assert len(consensus.warnings) == 3

    def test_not_enough_agents_fails_even_with_no_blocks(self):
        """Passing gate requiring 2 agents but only 1 agent passes -> fails."""
        results = {
            "codex": make_result(status="pass"),
        }

        consensus = compute_consensus(results, PRESCRIBER_GATE, CONSENSUS_CONFIG)

        assert consensus.passed is False
        assert consensus.requires_human_review is False  # no blocks, just agreement

    def test_agreement_fraction_calculated_correctly(self):
        results = {
            "codex": make_result(status="pass"),
            "notebooklm": make_result(status="fail", agent="notebooklm"),
        }

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert consensus.agent_agreement == pytest.approx(0.5)

    def test_warn_on_flag_does_not_block_requires_human(self):
        """warn_on demotion means requires_human_review is False (no actual blocks)."""
        flag = make_flag(issue="stale_sources", severity=Severity.BLOCK)
        results = {"codex": make_result(status="pass", flags=[flag])}

        consensus = compute_consensus(results, GENE_NOTE_GATE, CONSENSUS_CONFIG)

        assert consensus.requires_human_review is False
