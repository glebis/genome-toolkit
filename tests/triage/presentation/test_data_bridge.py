"""Tests for the data bridge converting domain types to TUI stubs."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from genome_toolkit.triage.domain.item import (
    Context,
    EvidenceTier,
    ItemId,
    Priority,
    Severity,
    SourceLocation,
    TriageItem,
)
from genome_toolkit.triage.domain.score import Score, ScoreBreakdown, TriageBucket
from genome_toolkit.triage.domain.suggestion import Suggestion, SuggestionSource
from genome_toolkit.triage.application.report import ScoredItem
from genome_toolkit.triage.presentation.tui.data_bridge import (
    scored_item_to_stub,
    suggestion_to_stub,
)


def _make_scored_item(
    text: str = "Test CRP blood draw",
    priority: Priority = Priority.HIGH,
    context: Context = Context.PRESCRIBER,
    due: date | None = date(2026, 4, 5),
    evidence_tier: EvidenceTier | None = EvidenceTier.E1,
    severity: Severity | None = Severity.SIGNIFICANT,
    linked_genes: list[str] | None = None,
    clinically_validated: bool = True,
    blocked_by: list[ItemId] | None = None,
    score_value: float = 85.0,
    bucket: TriageBucket = TriageBucket.DO_NOW,
) -> ScoredItem:
    item = TriageItem(
        item_id=ItemId.from_content("TestFile", text),
        source=SourceLocation(file_path=Path("Genes/IL6.md"), line_number=10),
        text=text,
        priority=priority,
        context=context,
        due=due,
        completed=False,
        evidence_tier=evidence_tier,
        severity=severity,
        linked_genes=linked_genes or ["IL6", "IL1B"],
        linked_systems=[],
        blocked_by=blocked_by or [],
        clinically_validated=clinically_validated,
    )
    breakdown = ScoreBreakdown(
        priority_score=18.75,
        overdue_score=4.0,
        evidence_score=15.0,
        lab_signal_score=10.0,
        context_score=10.0,
        severity_score=7.5,
        stuck_score=0.0,
    )
    score = Score(value=score_value, breakdown=breakdown, bucket=bucket)
    return ScoredItem(item=item, score=score)


class TestScoredItemToStub:
    def test_text_maps(self):
        si = _make_scored_item(text="Order ferritin recheck")
        stub = scored_item_to_stub(si)
        assert stub.text == "Order ferritin recheck"

    def test_score_maps(self):
        si = _make_scored_item(score_value=72.5)
        stub = scored_item_to_stub(si)
        assert stub.score == 72.5

    def test_bucket_maps(self):
        si = _make_scored_item(bucket=TriageBucket.THIS_WEEK)
        stub = scored_item_to_stub(si)
        assert stub.bucket == "THIS_WEEK"

    def test_priority_maps(self):
        si = _make_scored_item(priority=Priority.CRITICAL)
        stub = scored_item_to_stub(si)
        assert stub.priority == "critical"

    def test_context_maps(self):
        si = _make_scored_item(context=Context.TESTING)
        stub = scored_item_to_stub(si)
        assert stub.context == "testing"

    def test_context_vault_maintenance(self):
        si = _make_scored_item(context=Context.VAULT_MAINTENANCE)
        stub = scored_item_to_stub(si)
        assert stub.context == "vault-maintenance"

    def test_due_maps(self):
        si = _make_scored_item(due=date(2026, 5, 1))
        stub = scored_item_to_stub(si)
        assert stub.due == date(2026, 5, 1)

    def test_due_none(self):
        si = _make_scored_item(due=None)
        stub = scored_item_to_stub(si)
        assert stub.due is None

    def test_evidence_tier_maps(self):
        si = _make_scored_item(evidence_tier=EvidenceTier.E3)
        stub = scored_item_to_stub(si)
        assert stub.evidence_tier == "E3"

    def test_evidence_tier_none(self):
        si = _make_scored_item(evidence_tier=None)
        stub = scored_item_to_stub(si)
        assert stub.evidence_tier is None

    def test_severity_maps(self):
        si = _make_scored_item(severity=Severity.MODERATE)
        stub = scored_item_to_stub(si)
        assert stub.severity == "moderate"

    def test_severity_none(self):
        si = _make_scored_item(severity=None)
        stub = scored_item_to_stub(si)
        assert stub.severity is None

    def test_linked_genes_maps(self):
        si = _make_scored_item(linked_genes=["CYP2D6", "HFE"])
        stub = scored_item_to_stub(si)
        assert stub.linked_genes == ["CYP2D6", "HFE"]

    def test_breakdown_maps(self):
        si = _make_scored_item()
        stub = scored_item_to_stub(si)
        assert stub.breakdown == {
            "priority": 18.75,
            "overdue": 4.0,
            "evidence": 15.0,
            "lab_signal": 10.0,
            "context": 10.0,
            "severity": 7.5,
            "stuck": 0.0,
        }

    def test_clinically_validated_maps(self):
        si = _make_scored_item(clinically_validated=True)
        stub = scored_item_to_stub(si)
        assert stub.clinically_validated is True

    def test_source_file_maps(self):
        si = _make_scored_item()
        stub = scored_item_to_stub(si)
        assert stub.source_file == "Genes/IL6.md"

    def test_blocked_by_maps(self):
        blocker = ItemId.from_content("Other", "blocker task")
        si = _make_scored_item(blocked_by=[blocker])
        stub = scored_item_to_stub(si)
        assert stub.blocked_by == [blocker.value]

    def test_all_fields_present(self):
        si = _make_scored_item()
        stub = scored_item_to_stub(si)
        assert stub.text
        assert stub.score > 0
        assert stub.bucket
        assert stub.priority
        assert stub.context


class TestSuggestionToStub:
    def _make_suggestion(self) -> Suggestion:
        return Suggestion(
            text="Add SSRI augmentation protocol based on IL1B finding",
            source_type=SuggestionSource.UNINCORPORATED_FINDING,
            source_reference="Meta/Findings Index.md",
            recommended_priority=Priority.HIGH,
            recommended_context=Context.PRESCRIBER,
            rationale="IL1B OR 1.74 for SSRI nonremission",
        )

    def test_text_maps(self):
        stub = suggestion_to_stub(self._make_suggestion())
        assert stub.text == "Add SSRI augmentation protocol based on IL1B finding"

    def test_score_zero(self):
        stub = suggestion_to_stub(self._make_suggestion())
        assert stub.score == 0.0

    def test_bucket_suggestion(self):
        stub = suggestion_to_stub(self._make_suggestion())
        assert stub.bucket == "SUGGESTION"

    def test_priority_maps(self):
        stub = suggestion_to_stub(self._make_suggestion())
        assert stub.priority == "high"

    def test_context_maps(self):
        stub = suggestion_to_stub(self._make_suggestion())
        assert stub.context == "prescriber"

    def test_no_due(self):
        stub = suggestion_to_stub(self._make_suggestion())
        assert stub.due is None

    def test_breakdown_empty(self):
        stub = suggestion_to_stub(self._make_suggestion())
        assert stub.breakdown == {}
