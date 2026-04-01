from __future__ import annotations

from datetime import datetime
from typing import Union

from genome_toolkit.triage.domain.commands import (
    ApproveCommand,
    ChangePriorityCommand,
    CreateCommand,
    DeferCommand,
    DropCommand,
)
from genome_toolkit.triage.domain.item import TriageItem
from genome_toolkit.triage.domain.ports.repositories import SessionRepository, TaskRepository
from genome_toolkit.triage.domain.session import Action, TriageDecision, TriageSession, TriageStateSnapshot

Command = Union[DeferCommand, ApproveCommand, DropCommand, ChangePriorityCommand, CreateCommand]


class ApplyDecisions:
    """Validates and applies triage decisions, recording them in a session."""

    def __init__(
        self,
        task_repo: TaskRepository,
        session_repo: SessionRepository,
    ) -> None:
        self._task_repo = task_repo
        self._session_repo = session_repo

    def execute(self, decisions: list[tuple[TriageItem, Command]]) -> TriageSession:
        session = TriageSession(
            session_id=datetime.now().strftime("%Y%m%d-%H%M%S"),
            timestamp=datetime.now(),
        )

        for item, command in decisions:
            decision = self._build_decision(item, command)
            # TriageSession.add_decision enforces no conflicting actions
            session.add_decision(decision)
            self._apply_command(command)

        item_texts = {item.item_id.value: item.text for item, _ in decisions}
        self._session_repo.save_session(session, item_texts=item_texts)
        return session

    def _build_decision(self, item: TriageItem, command: Command) -> TriageDecision:
        previous = TriageStateSnapshot(
            priority=item.priority,
            due=item.due,
            context=item.context,
            completed=item.completed,
        )

        if isinstance(command, ApproveCommand):
            action = Action.APPROVE
            new = TriageStateSnapshot(
                priority=item.priority,
                due=item.due,
                context=item.context,
                completed=True,
            )
            note = command.note
        elif isinstance(command, DeferCommand):
            from datetime import date, timedelta

            action = Action.DEFER
            new_due = (item.due or date.today()) + timedelta(days=command.days)
            new = TriageStateSnapshot(
                priority=item.priority,
                due=new_due,
                context=item.context,
                completed=item.completed,
            )
            note = command.note
        elif isinstance(command, DropCommand):
            action = Action.DROP
            new = TriageStateSnapshot(
                priority=item.priority,
                due=item.due,
                context=item.context,
                completed=True,
            )
            note = command.note
        elif isinstance(command, ChangePriorityCommand):
            action = Action.CHANGE_PRIORITY
            new = TriageStateSnapshot(
                priority=command.new_priority,
                due=item.due,
                context=item.context,
                completed=item.completed,
            )
            note = command.note
        elif isinstance(command, CreateCommand):
            action = Action.CREATE
            new = TriageStateSnapshot(
                priority=command.priority,
                due=command.due,
                context=command.context,
                completed=False,
            )
            note = None
        else:
            raise TypeError(f"Unknown command type: {type(command)}")

        return TriageDecision(
            item_id=item.item_id,
            action=action,
            previous=previous,
            new=new,
            note=note,
        )

    def _apply_command(self, command: Command) -> None:
        if isinstance(command, CreateCommand):
            self._task_repo.create_item(command)
        else:
            self._task_repo.apply_command(command)
