"""Codex CLI validator wrapper for cross-model validation.

Wraps the Codex CLI to provide a second-opinion validation pass on genomic
claims using GPT-class models. The actual Codex subprocess call is stubbed
here — a real implementation would shell out to `codex` with the prompt built
from claim + context.

The stub returns a pass result so the multi-agent pipeline can proceed when
Codex is not available.
"""
from __future__ import annotations

import time
from typing import Any

from scripts.lib.multi_agent import AgentResult, ValidationFlag, Severity


AGENT_NAME = "codex"


def validate(claim: str, context: dict[str, Any]) -> AgentResult:
    """Validate a claim using the Codex CLI.

    Args:
        claim: The specific genomic/pharmacogenomic claim to validate.
        context: Supporting context dict. Recognised keys:
            - evidence_tier (str): E1-E5 tier assigned to the claim.
            - effect_size (float): Reported effect size (OR, beta, etc.).
            - citations (list[str]): PMIDs or DOIs supporting the claim.
            - validation_type (str): "gene_note" | "prescriber_report" | etc.

    Returns:
        AgentResult with status "skipped" when Codex is unavailable, or
        "pass"/"fail" when the CLI is available.
    """
    import shutil

    start = time.monotonic()

    if shutil.which("codex") is None:
        elapsed = int((time.monotonic() - start) * 1000)
        return AgentResult(
            agent=AGENT_NAME,
            status="skipped",
            flags=[],
            summary="Codex CLI not found on PATH — skipping cross-model validation.",
            duration_ms=elapsed,
            raw_output="",
        )

    # --- Real implementation would go here ---
    # prompt = _build_prompt(claim, context)
    # proc = subprocess.run(
    #     ["codex", "--model", "gpt-5-codex", "--reasoning-effort", "high"],
    #     input=prompt, capture_output=True, text=True, timeout=120,
    # )
    # return _parse_codex_output(proc.stdout, claim)
    # -----------------------------------------

    elapsed = int((time.monotonic() - start) * 1000)
    return AgentResult(
        agent=AGENT_NAME,
        status="pass",
        flags=[],
        summary="Codex stub: no issues found (real CLI call not executed).",
        duration_ms=elapsed,
        raw_output="",
    )


def _build_prompt(claim: str, context: dict[str, Any]) -> str:
    """Build the Codex prompt from claim and context."""
    lines = [
        "You are a pharmacogenomics fact-checker. Evaluate the following claim:",
        f"CLAIM: {claim}",
    ]
    if context.get("evidence_tier"):
        lines.append(f"Evidence tier: {context['evidence_tier']}")
    if context.get("effect_size") is not None:
        lines.append(f"Effect size: {context['effect_size']}")
    if context.get("citations"):
        citations = ", ".join(str(c) for c in context["citations"])
        lines.append(f"Citations: {citations}")
    lines.append(
        "\nRespond with JSON: {\"verdict\": \"pass\"|\"fail\", \"issues\": [...], \"suggestions\": [...]}"
    )
    return "\n".join(lines)
