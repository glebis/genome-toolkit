"""Multi-agent validation orchestration for the Genome Toolkit.

Dispatches validation tasks to multiple AI agents (Codex CLI, NotebookLM,
PubMed subagents, Tavily search) and aggregates results with consensus logic.

This module provides the Python-side orchestration. The actual agent calls
are made through Claude Code skills and the Codex CLI — this module defines
the data structures, configuration loading, and consensus logic.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml


class Severity(str, Enum):
    BLOCK = "block"
    WARN = "warn"
    INFO = "info"


@dataclass
class ValidationFlag:
    """A single issue found during validation."""
    severity: Severity
    agent: str                    # which agent found this
    claim: str                    # the claim being validated
    issue: str                    # what's wrong
    suggestion: str               # how to fix it
    evidence: str | None = None   # supporting evidence for the flag
    file_path: str | None = None  # vault note path


@dataclass
class AgentResult:
    """Result from a single validation agent."""
    agent: str
    status: Literal["pass", "fail", "error", "timeout", "skipped"]
    flags: list[ValidationFlag] = field(default_factory=list)
    summary: str = ""
    duration_ms: int = 0
    raw_output: str = ""


@dataclass
class ConsensusResult:
    """Aggregated consensus across all agents."""
    passed: bool
    blocking_flags: list[ValidationFlag]
    warning_flags: list[ValidationFlag]
    info_flags: list[ValidationFlag]
    agent_agreement: float         # 0.0-1.0: fraction of agents that passed
    requires_human_review: bool
    warnings: list[str] = field(default_factory=list)  # human-readable warning messages


@dataclass
class ValidationResult:
    """Complete result of a multi-agent validation run."""
    target: str                    # what was validated (note path, report name, "full_audit")
    validation_type: str           # "gene_note", "prescriber_report", "vault_audit"
    passed: bool
    agent_results: dict[str, AgentResult]
    consensus: ConsensusResult
    flags: list[ValidationFlag]
    recommendations: list[str]
    timestamp: str = ""


def load_agent_config(config_path: Path | None = None) -> dict[str, Any]:
    """Load multi-agent configuration from agents.yaml."""
    if config_path is None:
        config_path = Path(__file__).resolve().parent.parent.parent / "config" / "agents.yaml"

    if not config_path.exists():
        return {"agents": {}, "gates": {}, "consensus": {}}

    with open(config_path) as f:
        return yaml.safe_load(f) or {}


def get_gate_config(config: dict, validation_type: str) -> dict:
    """Get the gate configuration for a validation type."""
    return config.get("gates", {}).get(validation_type, {
        "required_agents": 1,
        "timeout_minutes": 10,
        "block_on": [],
        "warn_on": [],
    })


def _is_within_effect_size_tolerance(flag: ValidationFlag, tolerance: float) -> bool:
    """Return True if a flag's effect size discrepancy is within the tolerance.

    Looks for a numeric 'delta' stored in flag.evidence as 'delta=<value>' or
    falls back to False (conservative: treat unknown deltas as out of tolerance).
    The tolerance is a fractional value, e.g. 0.2 means 20%.
    """
    if flag.evidence is None:
        return False
    for part in flag.evidence.split():
        if part.startswith("delta="):
            try:
                delta = float(part[len("delta="):])
                return abs(delta) <= tolerance
            except ValueError:
                pass
    return False


def _is_within_evidence_tier_tolerance(flag: ValidationFlag, tolerance: int) -> bool:
    """Return True if a flag's evidence tier discrepancy is within the tolerance.

    Looks for 'tier_diff=<value>' in flag.evidence.
    """
    if flag.evidence is None:
        return False
    for part in flag.evidence.split():
        if part.startswith("tier_diff="):
            try:
                diff = int(part[len("tier_diff="):])
                return abs(diff) <= tolerance
            except ValueError:
                pass
    return False


def compute_consensus(
    agent_results: dict[str, AgentResult],
    gate: dict,
    consensus_config: dict,
) -> ConsensusResult:
    """Compute consensus across agent results.

    Logic:
    - Collect all flags from all agents
    - Check warn_on types from gate config; promote matching BLOCK flags to WARN
      and generate human-readable warning messages
    - Apply effect_size_tolerance: BLOCK flags for 'effect_size_mismatch' whose
      delta is within tolerance are demoted to WARN
    - Apply evidence_tier_tolerance: BLOCK flags for 'wrong_evidence_tier' whose
      tier_diff is within tolerance are demoted to WARN
    - Check if any remaining blocking flags match gate's block_on list
    - Check if enough agents passed (>= required_agents)
    """
    all_flags: list[ValidationFlag] = []
    for result in agent_results.values():
        all_flags.extend(result.flags)

    # Tolerance thresholds from consensus config
    effect_size_tolerance: float = consensus_config.get("effect_size_tolerance", 0.2)
    evidence_tier_tolerance: int = int(consensus_config.get("evidence_tier_tolerance", 1))

    # Gate lists
    block_on_types: set[str] = set(gate.get("block_on", []))
    warn_on_types: set[str] = set(gate.get("warn_on", []))

    # Classify flags, applying tolerance rules and warn_on promotion
    final_blocking: list[ValidationFlag] = []
    final_warnings: list[ValidationFlag] = []
    final_infos: list[ValidationFlag] = []
    human_warnings: list[str] = []

    for f in all_flags:
        if f.severity == Severity.BLOCK:
            # Apply effect_size_tolerance: demote to WARN if within tolerance
            if (
                f.issue == "effect_size_mismatch"
                and "effect_size_mismatch" in block_on_types
                and _is_within_effect_size_tolerance(f, effect_size_tolerance)
            ):
                demoted = ValidationFlag(
                    severity=Severity.WARN,
                    agent=f.agent,
                    claim=f.claim,
                    issue=f.issue,
                    suggestion=f.suggestion,
                    evidence=f.evidence,
                    file_path=f.file_path,
                )
                final_warnings.append(demoted)
                human_warnings.append(
                    f"[{f.agent}] effect_size_mismatch within {effect_size_tolerance:.0%} "
                    f"tolerance — demoted to warning: {f.claim}"
                )
                continue

            # Apply evidence_tier_tolerance: demote to WARN if within tolerance
            if (
                f.issue == "wrong_evidence_tier"
                and "wrong_evidence_tier" in block_on_types
                and _is_within_evidence_tier_tolerance(f, evidence_tier_tolerance)
            ):
                demoted = ValidationFlag(
                    severity=Severity.WARN,
                    agent=f.agent,
                    claim=f.claim,
                    issue=f.issue,
                    suggestion=f.suggestion,
                    evidence=f.evidence,
                    file_path=f.file_path,
                )
                final_warnings.append(demoted)
                human_warnings.append(
                    f"[{f.agent}] wrong_evidence_tier within {evidence_tier_tolerance}-tier "
                    f"tolerance — demoted to warning: {f.claim}"
                )
                continue

            # warn_on: if a BLOCK flag's issue is listed in warn_on, demote it
            if f.issue in warn_on_types:
                demoted = ValidationFlag(
                    severity=Severity.WARN,
                    agent=f.agent,
                    claim=f.claim,
                    issue=f.issue,
                    suggestion=f.suggestion,
                    evidence=f.evidence,
                    file_path=f.file_path,
                )
                final_warnings.append(demoted)
                human_warnings.append(
                    f"[{f.agent}] warn_on type '{f.issue}' flagged: {f.claim}"
                )
                continue

            final_blocking.append(f)

        elif f.severity == Severity.WARN:
            # Emit a human warning message for warn_on types
            if f.issue in warn_on_types:
                human_warnings.append(
                    f"[{f.agent}] warn_on type '{f.issue}' flagged: {f.claim}"
                )
            final_warnings.append(f)

        else:
            final_infos.append(f)

    # Remaining blocking flags that are in block_on list
    actual_blocks = [f for f in final_blocking if f.issue in block_on_types]

    # Count passing agents
    passing = sum(1 for r in agent_results.values() if r.status == "pass")
    total = sum(1 for r in agent_results.values() if r.status != "skipped")
    agreement = passing / total if total > 0 else 0.0

    required = gate.get("required_agents", 1)
    enough_agreement = passing >= required

    passed = enough_agreement and len(actual_blocks) == 0
    requires_human = (
        len(actual_blocks) > 0
        and consensus_config.get("require_human_for_blocks", True)
    )

    return ConsensusResult(
        passed=passed,
        blocking_flags=final_blocking,
        warning_flags=final_warnings,
        info_flags=final_infos,
        agent_agreement=agreement,
        requires_human_review=requires_human,
        warnings=human_warnings,
    )


def check_available_agents(config: dict) -> dict[str, bool]:
    """Check which configured agents are actually available.

    Returns dict of agent_name -> is_available. An agent is available if:
    - It's enabled in config
    - Its required skill/binary exists (checked by name convention)

    External skills (notebooklm, tavily-search, firecrawl-research) are
    checked by looking for their skill directories in ~/.claude/skills/.
    Codex CLI is checked by looking for the `codex` binary.
    Subagents (Claude) are always available.
    """
    import shutil

    agents = config.get("agents", {})
    available = {}
    skills_dir = Path.home() / ".claude" / "skills"

    for name, agent_config in agents.items():
        if not agent_config.get("enabled", True):
            available[name] = False
            continue

        if name == "codex":
            available[name] = shutil.which("codex") is not None
        elif name == "subagents":
            available[name] = True  # Claude subagents always available
        elif "skill" in agent_config:
            skill_name = agent_config["skill"]
            available[name] = (skills_dir / skill_name).is_dir()
        else:
            available[name] = True  # no external dependency

    return available


def adjust_gate_for_available_agents(
    gate: dict,
    available: dict[str, bool],
) -> dict:
    """Adjust gate requirements based on which agents are actually available.

    If fewer agents are available than required_agents, lower the requirement
    to the number of available agents (minimum 1). This allows validation to
    proceed with degraded confidence rather than blocking entirely.
    """
    num_available = sum(1 for v in available.values() if v)
    adjusted = dict(gate)

    original_required = gate.get("required_agents", 1)
    if num_available < original_required:
        adjusted["required_agents"] = max(1, num_available)
        adjusted["_degraded"] = True
        adjusted["_original_required"] = original_required
        adjusted["_available_agents"] = num_available
    else:
        adjusted["_degraded"] = False

    return adjusted


def format_validation_report(result: ValidationResult) -> str:
    """Format a validation result as a markdown report."""
    lines = [
        f"# Validation Report: {result.target}",
        f"**Type**: {result.validation_type}",
        f"**Result**: {'PASSED' if result.passed else 'BLOCKED'}",
        f"**Agent Agreement**: {result.consensus.agent_agreement:.0%}",
        "",
    ]

    if result.consensus.blocking_flags:
        lines.append("## Blocking Issues")
        for flag in result.consensus.blocking_flags:
            lines.append(f"- **[{flag.agent}]** {flag.claim}: {flag.issue}")
            lines.append(f"  - Suggestion: {flag.suggestion}")
        lines.append("")

    if result.consensus.warning_flags:
        lines.append("## Warnings")
        for flag in result.consensus.warning_flags:
            lines.append(f"- **[{flag.agent}]** {flag.claim}: {flag.issue}")
        lines.append("")

    if result.recommendations:
        lines.append("## Recommendations")
        for rec in result.recommendations:
            lines.append(f"- {rec}")
        lines.append("")

    lines.append("## Agent Results")
    for agent, ar in result.agent_results.items():
        lines.append(f"### {agent}")
        lines.append(f"- Status: {ar.status}")
        lines.append(f"- Duration: {ar.duration_ms}ms")
        if ar.summary:
            lines.append(f"- Summary: {ar.summary}")
        lines.append("")

    return "\n".join(lines)
