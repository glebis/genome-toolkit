from __future__ import annotations

from abc import ABC, abstractmethod
from contextlib import contextmanager
from typing import Generator, Union

from genome_toolkit.triage.domain.commands import (
    ApproveCommand,
    ChangePriorityCommand,
    CreateCommand,
    DeferCommand,
    DropCommand,
)
from genome_toolkit.triage.domain.item import ItemId, TriageItem
from genome_toolkit.triage.domain.session import TriageSession
from genome_toolkit.triage.domain.signals import Finding, LabSignal


class TaskRepository(ABC):
    @abstractmethod
    def get_all_open(self) -> list[TriageItem]: ...

    @abstractmethod
    def apply_command(
        self,
        command: Union[DeferCommand, ApproveCommand, DropCommand, ChangePriorityCommand],
    ) -> None: ...

    @abstractmethod
    def create_item(self, command: CreateCommand) -> None: ...

    @abstractmethod
    @contextmanager
    def acquire_lock(self) -> Generator[None, None, None]: ...


class FindingsRepository(ABC):
    @abstractmethod
    def get_unincorporated(self) -> list[Finding]: ...


class LabSignalRepository(ABC):
    @abstractmethod
    def get_active_signals(self) -> list[LabSignal]: ...


class SessionRepository(ABC):
    @abstractmethod
    def save_session(self, session: TriageSession, item_texts: dict[str, str] | None = None) -> None: ...

    @abstractmethod
    def get_recent(self, limit: int = 10) -> list[TriageSession]: ...

    @abstractmethod
    def get_defer_count(self, item_id: ItemId) -> int: ...
