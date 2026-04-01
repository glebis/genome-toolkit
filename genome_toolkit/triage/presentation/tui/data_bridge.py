"""Bridge between domain/application types and TUI stub types."""
from __future__ import annotations

import re

from genome_toolkit.triage.application.report import ScoredItem
from genome_toolkit.triage.domain.suggestion import Suggestion
from genome_toolkit.triage.presentation.tui.stub_data import ScoredItemStub


def _build_description(scored: ScoredItem) -> str:
    """Build a concise description — only non-obvious context."""
    bd = scored.score.breakdown
    parts = []

    # Stuck warning (most actionable signal)
    if bd.stuck_score > 0:
        defer_count = max(1, int(bd.stuck_score / 33 * 3 + 0.5))
        parts.append(f"Deferred {defer_count}x")

    # Lab signal (if active)
    if bd.lab_signal_score > 0:
        parts.append(f"Lab signal active ({bd.lab_signal_score:.0f}/{15:.0f})")

    # Low overdue = not urgent yet
    if bd.overdue_score == 0 and scored.item.due:
        parts.append(f"Due {scored.item.due.isoformat()}")

    return " \u00b7 ".join(parts) if parts else ""


def _classify_automation(text: str, context: str) -> str:
    """Classify automation level based on task text and context."""
    if context in ("prescriber", "testing"):
        return "manual"

    text_lower = text.lower()
    auto_patterns = [
        r"create \w+ gene note",
        r"run pubmed",
        r"run.*audit",
    ]
    for pattern in auto_patterns:
        if re.search(pattern, text_lower):
            return "auto"

    if context in ("vault-maintenance", "research", "monitoring"):
        return "semi"

    return "manual"


def scored_item_to_stub(scored: ScoredItem) -> ScoredItemStub:
    """Convert a domain ScoredItem to a TUI ScoredItemStub."""
    item = scored.item
    score = scored.score
    bd = score.breakdown
    ctx = item.context.name.lower().replace("_", "-") if item.context else "unknown"

    return ScoredItemStub(
        text=item.text,
        score=score.value,
        bucket=score.bucket.name,
        priority=item.priority.name.lower(),
        context=ctx,
        due=item.due,
        evidence_tier=item.evidence_tier.name if item.evidence_tier else None,
        severity=item.severity.name.lower() if item.severity else None,
        linked_genes=list(item.linked_genes),
        lab_signal=None,
        breakdown={
            "priority": bd.priority_score,
            "overdue": bd.overdue_score,
            "evidence": bd.evidence_score,
            "lab_signal": bd.lab_signal_score,
            "context": bd.context_score,
            "severity": bd.severity_score,
            "stuck": bd.stuck_score,
        },
        clinically_validated=item.clinically_validated,
        blocked_by=[bid.value for bid in item.blocked_by],
        source_file=str(item.source.file_path) if str(item.source.file_path) != "." else "",
        description=_build_description(scored),
        automation_level=_classify_automation(item.text, ctx),
    )


def suggestion_to_stub(suggestion: Suggestion) -> ScoredItemStub:
    """Convert a domain Suggestion to a TUI ScoredItemStub."""
    ctx = suggestion.recommended_context.name.lower().replace("_", "-")
    return ScoredItemStub(
        text=suggestion.text,
        score=0.0,
        bucket="SUGGESTION",
        priority=suggestion.recommended_priority.name.lower(),
        context=ctx,
        due=None,
        evidence_tier=None,
        severity=None,
        linked_genes=[],
        lab_signal=None,
        breakdown={},
        clinically_validated=False,
        blocked_by=[],
        source_file=suggestion.source_reference,
        description=suggestion.rationale,
        automation_level=_classify_automation(suggestion.text, ctx),
    )
