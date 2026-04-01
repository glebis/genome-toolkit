"""Bridge between domain/application types and TUI stub types."""
from __future__ import annotations

from genome_toolkit.triage.application.report import ScoredItem
from genome_toolkit.triage.domain.suggestion import Suggestion
from genome_toolkit.triage.presentation.tui.stub_data import ScoredItemStub


def scored_item_to_stub(scored: ScoredItem) -> ScoredItemStub:
    """Convert a domain ScoredItem to a TUI ScoredItemStub."""
    item = scored.item
    score = scored.score
    bd = score.breakdown

    return ScoredItemStub(
        text=item.text,
        score=score.value,
        bucket=score.bucket.name,
        priority=item.priority.name.lower(),
        context=item.context.name.lower().replace("_", "-"),
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
        source_file=str(item.source.file_path),
    )


def suggestion_to_stub(suggestion: Suggestion) -> ScoredItemStub:
    """Convert a domain Suggestion to a TUI ScoredItemStub."""
    return ScoredItemStub(
        text=suggestion.text,
        score=0.0,
        bucket="SUGGESTION",
        priority=suggestion.recommended_priority.name.lower(),
        context=suggestion.recommended_context.name.lower().replace("_", "-"),
        due=None,
        evidence_tier=None,
        severity=None,
        linked_genes=[],
        lab_signal=None,
        breakdown={},
        clinically_validated=False,
        blocked_by=[],
        source_file="",
    )
