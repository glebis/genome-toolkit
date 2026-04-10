"""NotebookLM validator wrapper for source-grounded claim checking.

Delegates claim validation to the NotebookLM Claude skill, which can check
claims against uploaded source PDFs. Because NotebookLM requires manual
document upload, this validator is always in "requires_manual_upload" mode
and will return "skipped" unless the skill is available and documents have
been pre-loaded.

The stub returns "skipped" so the pipeline gracefully degrades when the skill
is not present.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from scripts.lib.multi_agent import AgentResult, ValidationFlag, Severity


AGENT_NAME = "notebooklm"

_SKILLS_DIR = Path.home() / ".claude" / "skills"
_SKILL_NAME = "notebooklm"


def validate(claim: str, context: dict[str, Any]) -> AgentResult:
    """Validate a claim using NotebookLM source-grounded checking.

    Args:
        claim: The genomic/pharmacogenomic claim to verify against sources.
        context: Supporting context dict. Recognised keys:
            - source_pdfs (list[str]): Paths to PDF sources already uploaded
              to NotebookLM (must be loaded manually before calling).
            - notebook_id (str): Optional existing NotebookLM notebook ID.
            - validation_type (str): "prescriber_doc_factcheck" etc.

    Returns:
        AgentResult with status "skipped" when skill unavailable, or
        "pass"/"fail" when the skill runs successfully.
    """
    start = time.monotonic()

    skill_available = (_SKILLS_DIR / _SKILL_NAME).is_dir()

    if not skill_available:
        elapsed = int((time.monotonic() - start) * 1000)
        return AgentResult(
            agent=AGENT_NAME,
            status="skipped",
            flags=[],
            summary=(
                f"NotebookLM skill not found at {_SKILLS_DIR / _SKILL_NAME} "
                "— skipping source-grounded validation."
            ),
            duration_ms=elapsed,
            raw_output="",
        )

    if not context.get("source_pdfs"):
        elapsed = int((time.monotonic() - start) * 1000)
        flag = ValidationFlag(
            severity=Severity.WARN,
            agent=AGENT_NAME,
            claim=claim,
            issue="No source PDFs provided for NotebookLM validation",
            suggestion=(
                "Upload source PDFs to NotebookLM and pass their paths in "
                "context['source_pdfs'] before calling this validator."
            ),
        )
        return AgentResult(
            agent=AGENT_NAME,
            status="skipped",
            flags=[flag],
            summary="No source PDFs — NotebookLM validation skipped.",
            duration_ms=elapsed,
            raw_output="",
        )

    # --- Real implementation would go here ---
    # skill_output = subprocess.run(
    #     ["claude", "skill", "notebooklm", "--claim", claim,
    #      "--notebook", context.get("notebook_id", ""),
    #      "--sources", *context["source_pdfs"]],
    #     capture_output=True, text=True,
    # )
    # return _parse_skill_output(skill_output.stdout, claim)
    # -----------------------------------------

    elapsed = int((time.monotonic() - start) * 1000)
    return AgentResult(
        agent=AGENT_NAME,
        status="pass",
        flags=[],
        summary="NotebookLM stub: source check skipped (real skill call not executed).",
        duration_ms=elapsed,
        raw_output="",
    )
