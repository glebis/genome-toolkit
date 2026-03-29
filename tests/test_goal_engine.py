"""Tests for the goal-driven onboarding engine."""
import pytest
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent


class TestGoalMapConfig:
    """Test goal_map.yaml structure and validity."""

    @pytest.fixture
    def goal_map(self):
        path = REPO_ROOT / "config" / "goal_map.yaml"
        with open(path) as f:
            return yaml.safe_load(f)

    def test_goals_exist(self, goal_map):
        assert "goals" in goal_map
        assert len(goal_map["goals"]) >= 7

    def test_required_goal_fields(self, goal_map):
        required_fields = {"display", "target_systems", "seed_genes", "first_reports", "first_tests", "priority"}
        for goal_id, goal in goal_map["goals"].items():
            for field in required_fields:
                assert field in goal, f"Goal '{goal_id}' missing field '{field}'"

    def test_medication_safety_has_cyp_genes(self, goal_map):
        med = goal_map["goals"]["medication_safety"]
        assert "CYP2D6" in med["seed_genes"]
        assert "CYP2C19" in med["seed_genes"]
        assert "CYP2C9" in med["seed_genes"]

    def test_mental_health_has_neurotransmitter_genes(self, goal_map):
        mh = goal_map["goals"]["mental_health"]
        assert "COMT" in mh["seed_genes"]
        assert "SLC6A4" in mh["seed_genes"]
        assert "BDNF" in mh["seed_genes"]

    def test_comprehensive_uses_all(self, goal_map):
        comp = goal_map["goals"]["comprehensive"]
        assert comp["target_systems"] == "all"
        assert comp["seed_genes"] == "top_scored"

    def test_priorities_unique(self, goal_map):
        priorities = [g["priority"] for g in goal_map["goals"].values()]
        assert len(priorities) == len(set(priorities)), "Goal priorities must be unique"

    def test_scoring_weights_exist(self, goal_map):
        assert "scoring" in goal_map
        weights = goal_map["scoring"]
        assert "medication_match" in weights
        assert "goal_match" in weights
        assert "severe_finding" in weights
        assert weights["medication_match"] > weights["goal_match"]  # medication safety highest

    def test_generation_limits(self, goal_map):
        assert "limits" in goal_map
        limits = goal_map["limits"]
        assert limits["max_genes"] == 12
        assert limits["min_genes"] == 8
        assert limits["max_systems"] == 4

    def test_seed_gene_counts_within_limits(self, goal_map):
        """Each goal's seed_genes should be reasonable (not more than max_genes * 2)."""
        max_genes = goal_map["limits"]["max_genes"]
        for goal_id, goal in goal_map["goals"].items():
            if isinstance(goal["seed_genes"], list):
                assert len(goal["seed_genes"]) <= max_genes * 2, \
                    f"Goal '{goal_id}' has too many seed genes: {len(goal['seed_genes'])}"


class TestEvidenceTiersConfig:
    """Test evidence_tiers.yaml structure."""

    @pytest.fixture
    def tiers(self):
        path = REPO_ROOT / "config" / "evidence_tiers.yaml"
        with open(path) as f:
            return yaml.safe_load(f)

    def test_all_five_tiers(self, tiers):
        assert set(tiers["tiers"].keys()) == {"E1", "E2", "E3", "E4", "E5"}

    def test_tier_fields(self, tiers):
        for tier_id, tier in tiers["tiers"].items():
            assert "name" in tier, f"{tier_id} missing name"
            assert "description" in tier, f"{tier_id} missing description"
            assert "confidence" in tier, f"{tier_id} missing confidence"
            assert "use_in" in tier, f"{tier_id} missing use_in"


class TestAgentsConfig:
    """Test agents.yaml structure."""

    @pytest.fixture
    def agents_config(self):
        path = REPO_ROOT / "config" / "agents.yaml"
        with open(path) as f:
            return yaml.safe_load(f)

    def test_agents_defined(self, agents_config):
        assert "agents" in agents_config
        assert "codex" in agents_config["agents"]
        assert "notebooklm" in agents_config["agents"]
        assert "tavily" in agents_config["agents"]

    def test_gates_defined(self, agents_config):
        assert "gates" in agents_config
        assert "gene_note" in agents_config["gates"]
        assert "prescriber_report" in agents_config["gates"]
        assert "vault_audit" in agents_config["gates"]

    def test_prescriber_gate_strict(self, agents_config):
        gate = agents_config["gates"]["prescriber_report"]
        assert gate["required_agents"] >= 2
        assert "drug_contraindication_error" in gate["block_on"]
        assert "dosing_error" in gate["block_on"]

    def test_consensus_config(self, agents_config):
        assert "consensus" in agents_config
        c = agents_config["consensus"]
        assert c["drug_interaction_strict"] is True
        assert c["require_human_for_blocks"] is True
        assert 0 < c["effect_size_tolerance"] <= 0.5


class TestMultiAgentConsensus:
    """Test consensus logic from multi_agent.py."""

    def test_import_multi_agent(self):
        from lib.multi_agent import (
            compute_consensus, Severity, ValidationFlag, AgentResult,
            load_agent_config, format_validation_report, ValidationResult,
            ConsensusResult,
        )

    def test_all_pass(self):
        from lib.multi_agent import compute_consensus, AgentResult

        results = {
            "codex": AgentResult(agent="codex", status="pass"),
            "notebooklm": AgentResult(agent="notebooklm", status="pass"),
        }
        gate = {"required_agents": 1, "block_on": []}
        consensus = compute_consensus(results, gate, {})
        assert consensus.passed is True
        assert consensus.agent_agreement == 1.0

    def test_blocking_flag(self):
        from lib.multi_agent import compute_consensus, AgentResult, ValidationFlag, Severity

        flag = ValidationFlag(
            severity=Severity.BLOCK,
            agent="codex",
            claim="CYP2D6 poor metabolizer",
            issue="drug_contraindication_error",
            suggestion="Add tramadol to AVOID list",
        )
        results = {
            "codex": AgentResult(agent="codex", status="fail", flags=[flag]),
        }
        gate = {"required_agents": 1, "block_on": ["drug_contraindication_error"]}
        consensus = compute_consensus(results, gate, {"require_human_for_blocks": True})

        assert consensus.passed is False
        assert consensus.requires_human_review is True
        assert len(consensus.blocking_flags) == 1

    def test_warning_does_not_block(self):
        from lib.multi_agent import compute_consensus, AgentResult, ValidationFlag, Severity

        flag = ValidationFlag(
            severity=Severity.WARN,
            agent="codex",
            claim="BDNF Val/Val",
            issue="stale_sources",
            suggestion="Re-check sources published before 2024",
        )
        results = {
            "codex": AgentResult(agent="codex", status="pass", flags=[flag]),
        }
        gate = {"required_agents": 1, "block_on": []}
        consensus = compute_consensus(results, gate, {})

        assert consensus.passed is True
        assert len(consensus.warning_flags) == 1

    def test_insufficient_agents(self):
        from lib.multi_agent import compute_consensus, AgentResult

        results = {
            "codex": AgentResult(agent="codex", status="fail"),
            "notebooklm": AgentResult(agent="notebooklm", status="fail"),
        }
        gate = {"required_agents": 2, "block_on": []}
        consensus = compute_consensus(results, gate, {})

        assert consensus.passed is False
        assert consensus.agent_agreement == 0.0

    def test_skipped_agents_excluded(self):
        from lib.multi_agent import compute_consensus, AgentResult

        results = {
            "codex": AgentResult(agent="codex", status="pass"),
            "notebooklm": AgentResult(agent="notebooklm", status="skipped"),
        }
        gate = {"required_agents": 1, "block_on": []}
        consensus = compute_consensus(results, gate, {})

        assert consensus.passed is True
        assert consensus.agent_agreement == 1.0  # 1/1 non-skipped passed
