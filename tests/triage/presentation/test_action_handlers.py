"""Tests for TUI action handlers."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from genome_toolkit.triage.domain.item import (
    Context,
    ItemId,
    Priority,
    SourceLocation,
    TriageItem,
)
from genome_toolkit.triage.domain.commands import (
    ApproveCommand,
    ChangePriorityCommand,
    CreateCommand,
    DeferCommand,
    DropCommand,
)
from genome_toolkit.triage.domain.score import Score, ScoreBreakdown, TriageBucket
from genome_toolkit.triage.application.report import ScoredItem, TriageReport
from genome_toolkit.triage.presentation.tui.action_handlers import (
    build_command_for_action,
    build_create_command,
    find_domain_item,
)


def _make_item(text: str = "Test action item") -> TriageItem:
    return TriageItem(
        item_id=ItemId.from_content("test", text),
        source=SourceLocation(file_path=Path("test.md"), line_number=1),
        text=text,
        priority=Priority.HIGH,
        context=Context.PRESCRIBER,
        due=None,
        completed=False,
        evidence_tier=None,
        severity=None,
    )


def _make_report(items: list[TriageItem]) -> TriageReport:
    scored = [
        ScoredItem(
            item=item,
            score=Score(
                value=50.0,
                bucket=TriageBucket.THIS_WEEK,
                breakdown=ScoreBreakdown(
                    priority_score=10.0,
                    overdue_score=5.0,
                    evidence_score=10.0,
                    lab_signal_score=5.0,
                    context_score=10.0,
                    severity_score=5.0,
                    stuck_score=5.0,
                ),
            ),
        )
        for item in items
    ]
    return TriageReport(
        scored_items=scored,
        suggestions=[],
        total_items=len(items),
        bucket_counts={TriageBucket.THIS_WEEK: len(items)},
        timestamp=datetime.now(),
    )


class TestFindDomainItem:
    def test_returns_match(self):
        item = _make_item("Schedule blood draw")
        report = _make_report([_make_item("Other item"), item])
        result = find_domain_item(report, "Schedule blood draw")
        assert result is item

    def test_returns_none_when_no_match(self):
        report = _make_report([_make_item("Something else")])
        result = find_domain_item(report, "Does not exist")
        assert result is None

    def test_returns_none_when_report_is_none(self):
        result = find_domain_item(None, "anything")
        assert result is None


class TestBuildCommandForAction:
    def test_approve(self):
        item = _make_item()
        cmd = build_command_for_action(item, "approve")
        assert isinstance(cmd, ApproveCommand)
        assert cmd.item_id == item.item_id

    def test_defer(self):
        item = _make_item()
        cmd = build_command_for_action(item, "defer")
        assert isinstance(cmd, DeferCommand)
        assert cmd.item_id == item.item_id
        assert cmd.days == 7

    def test_drop(self):
        item = _make_item()
        cmd = build_command_for_action(item, "drop")
        assert isinstance(cmd, DropCommand)
        assert cmd.item_id == item.item_id
        assert cmd.note == "triaged out via TUI"

    def test_priority_change(self):
        item = _make_item()
        cmd = build_command_for_action(item, "priority_change", new_priority="critical")
        assert isinstance(cmd, ChangePriorityCommand)
        assert cmd.new_priority == Priority.CRITICAL

    def test_unknown_action_returns_none(self):
        item = _make_item()
        cmd = build_command_for_action(item, "unknown_action")
        assert cmd is None

    def test_priority_change_without_value_returns_none(self):
        item = _make_item()
        cmd = build_command_for_action(item, "priority_change", new_priority=None)
        assert cmd is None


class TestBuildCreateCommand:
    def test_creates_command_and_item(self):
        vault = Path("/tmp/vault")
        cmd, item = build_create_command(vault, "New task", "high", "prescriber")

        assert isinstance(cmd, CreateCommand)
        assert cmd.text == "New task"
        assert cmd.priority == Priority.HIGH
        assert cmd.context == Context.PRESCRIBER
        assert cmd.file_path == vault / "Meta" / "Triage Report.md"

        assert isinstance(item, TriageItem)
        assert item.text == "New task"
        assert item.priority == Priority.HIGH
        assert item.context == Context.PRESCRIBER
        assert item.completed is False

    def test_vault_maintenance_context_hyphen(self):
        vault = Path("/tmp/vault")
        cmd, item = build_create_command(vault, "Fix links", "low", "vault-maintenance")

        assert cmd.context == Context.VAULT_MAINTENANCE
        assert item.context == Context.VAULT_MAINTENANCE
