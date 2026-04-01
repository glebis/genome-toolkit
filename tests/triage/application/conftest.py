from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from pathlib import Path
from typing import Generator, Union

import pytest

from genome_toolkit.triage.domain.commands import (
    ApproveCommand,
    ChangePriorityCommand,
    CreateCommand,
    DeferCommand,
    DropCommand,
)
from genome_toolkit.triage.domain.item import (
    Context,
    EvidenceTier,
    ItemId,
    Priority,
    Severity,
    SourceLocation,
    TriageItem,
)
from genome_toolkit.triage.domain.ports.repositories import (
    FindingsRepository,
    LabSignalRepository,
    SessionRepository,
    TaskRepository,
)
from genome_toolkit.triage.domain.session import TriageSession
from genome_toolkit.triage.domain.signals import Direction, Finding, LabSignal


# ── In-memory repository stubs ──────────────────────────────────────────


class InMemoryTaskRepository(TaskRepository):
    def __init__(self, items: list[TriageItem] | None = None) -> None:
        self._items = list(items or [])
        self.applied_commands: list = []
        self.created_items: list[CreateCommand] = []

    def get_all_open(self) -> list[TriageItem]:
        return [i for i in self._items if not i.completed]

    def apply_command(
        self,
        command: Union[DeferCommand, ApproveCommand, DropCommand, ChangePriorityCommand],
    ) -> None:
        self.applied_commands.append(command)

    def create_item(self, command: CreateCommand) -> None:
        self.created_items.append(command)

    @contextmanager
    def acquire_lock(self) -> Generator[None, None, None]:
        yield


class InMemoryFindingsRepository(FindingsRepository):
    def __init__(self, findings: list[Finding] | None = None) -> None:
        self._findings = list(findings or [])

    def get_unincorporated(self) -> list[Finding]:
        return [f for f in self._findings if f.incorporated_into is None]


class InMemoryLabSignalRepository(LabSignalRepository):
    def __init__(self, signals: list[LabSignal] | None = None) -> None:
        self._signals = list(signals or [])

    def get_active_signals(self) -> list[LabSignal]:
        return list(self._signals)


class InMemorySessionRepository(SessionRepository):
    def __init__(self) -> None:
        self._sessions: list[TriageSession] = []
        self._defer_counts: dict[str, int] = {}

    def save_session(self, session: TriageSession, item_texts: dict[str, str] | None = None) -> None:
        self._sessions.append(session)

    def get_recent(self, limit: int = 10) -> list[TriageSession]:
        return self._sessions[-limit:]

    def get_defer_count(self, item_id: ItemId) -> int:
        return self._defer_counts.get(item_id.value, 0)

    def set_defer_count(self, item_id: ItemId, count: int) -> None:
        self._defer_counts[item_id.value] = count


# ── Shared fixtures ─────────────────────────────────────────────────────


def _make_item(
    text: str,
    priority: Priority = Priority.MEDIUM,
    context: Context = Context.RESEARCH,
    due: date | None = None,
    evidence_tier: EvidenceTier | None = None,
    severity: Severity | None = None,
    linked_genes: list[str] | None = None,
    completed: bool = False,
) -> TriageItem:
    item_id = ItemId.from_content("TestNote", text)
    return TriageItem(
        item_id=item_id,
        source=SourceLocation(file_path=Path("Reports/Test.md"), line_number=1),
        text=text,
        priority=priority,
        context=context,
        due=due,
        completed=completed,
        evidence_tier=evidence_tier,
        severity=severity,
        linked_genes=linked_genes or [],
        linked_systems=[],
    )


@pytest.fixture
def make_item():
    return _make_item


@pytest.fixture
def high_priority_prescriber_item() -> TriageItem:
    return _make_item(
        text="Request CRP blood test",
        priority=Priority.CRITICAL,
        context=Context.PRESCRIBER,
        due=date(2026, 4, 1),
        evidence_tier=EvidenceTier.E1,
        severity=Severity.SIGNIFICANT,
        linked_genes=["IL6", "IL1B"],
    )


@pytest.fixture
def low_priority_research_item() -> TriageItem:
    return _make_item(
        text="Review telomere length PRS",
        priority=Priority.LOW,
        context=Context.RESEARCH,
        due=date(2026, 6, 1),
        evidence_tier=EvidenceTier.E5,
        severity=Severity.LIFESTYLE,
    )


@pytest.fixture
def medium_vault_item() -> TriageItem:
    return _make_item(
        text="Update FADS1 gene note",
        priority=Priority.MEDIUM,
        context=Context.VAULT_MAINTENANCE,
        evidence_tier=EvidenceTier.E3,
        severity=Severity.MODERATE,
    )


@pytest.fixture
def crp_lab_signal() -> LabSignal:
    return LabSignal(
        biomarker="CRP",
        value=8.5,
        threshold=5.0,
        direction=Direction.ABOVE,
        z_score=2.1,
        linked_genes=["IL6", "IL1B"],
        confidence=0.9,
    )


@pytest.fixture
def unincorporated_finding() -> Finding:
    return Finding(
        text="NAT2 slow acetylator affects isoniazid metabolism",
        source_note="Research/NAT2 Review",
        evidence_tier=EvidenceTier.E2,
        actionable=True,
        incorporated_into=None,
    )
