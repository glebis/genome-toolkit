"""Action handlers for TUI -- maps TUI actions to domain commands."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

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
from genome_toolkit.triage.application.report import TriageReport


def find_domain_item(
    report: Optional[TriageReport], stub_text: str
) -> Optional[TriageItem]:
    """Find the domain item matching a stub by text."""
    if not report:
        return None
    for si in report.scored_items:
        if si.item.text == stub_text:
            return si.item
    return None


def build_command_for_action(
    domain_item: TriageItem,
    action: str,
    new_priority: str | None = None,
):
    """Build a domain command from a TUI action string."""
    if action == "approve":
        return ApproveCommand(item_id=domain_item.item_id)
    elif action == "defer":
        return DeferCommand(item_id=domain_item.item_id, days=7)
    elif action == "drop":
        return DropCommand(item_id=domain_item.item_id, note="triaged out via TUI")
    elif action == "priority_change" and new_priority:
        return ChangePriorityCommand(
            item_id=domain_item.item_id,
            new_priority=Priority[new_priority.upper()],
        )
    return None


def build_create_command(
    vault_path: Path, text: str, priority: str, context: str
) -> tuple[CreateCommand, TriageItem]:
    """Build a CreateCommand for an approved suggestion."""
    target_file = vault_path / "Meta" / "Triage Report.md"
    parsed_priority = Priority[priority.upper()]
    parsed_context = Context[context.upper().replace("-", "_")]
    return CreateCommand(
        file_path=target_file,
        text=text,
        priority=parsed_priority,
        context=parsed_context,
    ), TriageItem(
        item_id=ItemId.from_content("triage", text),
        source=SourceLocation(file_path=target_file, line_number=0),
        text=text,
        priority=parsed_priority,
        context=parsed_context,
        due=None,
        completed=False,
        evidence_tier=None,
        severity=None,
    )


def apply_pending_actions(
    vault_path: Path, pending_actions: list[tuple]
) -> int:
    """Apply all pending actions to vault. Returns count of applied decisions."""
    if not vault_path or not pending_actions:
        return 0

    from genome_toolkit.triage.infrastructure.vault.task_parser import (
        VaultTaskRepository,
    )
    from genome_toolkit.triage.infrastructure.persistence.session_store import (
        MarkdownSessionRepository,
    )
    from genome_toolkit.triage.application.apply_decisions import ApplyDecisions

    task_repo = VaultTaskRepository(vault_path)
    session_repo = MarkdownSessionRepository(vault_path)
    applier = ApplyDecisions(task_repo=task_repo, session_repo=session_repo)
    session = applier.execute(pending_actions)
    return len(session.decisions)
