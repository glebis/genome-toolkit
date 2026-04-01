"""TaskWriter: update checklist items stored inside the vault."""
from __future__ import annotations

import fcntl
import hashlib
import os
import re
import tempfile
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path
from typing import Iterator, Union

from genome_toolkit.triage.domain.commands import (
    ApproveCommand,
    ChangePriorityCommand,
    CreateCommand,
    DeferCommand,
    DropCommand,
)
from genome_toolkit.triage.domain.item import Context, ItemId, Priority
from genome_toolkit.triage.infrastructure.vault._task_utils import (
    normalize_task_text,
    replace_inline_field,
)

_TASK_RE = re.compile(r"^(- \[)([ xX])(\] .+)$")
_BLOCK_ID_RE = re.compile(r"\^([\w-]+)")


class TaskWriter:
    def __init__(self, vault_root: Path) -> None:
        self._vault_root = vault_root
        self._lock_path = vault_root / ".triage.lock"

    def apply_command(
        self,
        command: Union[DeferCommand, ApproveCommand, DropCommand, ChangePriorityCommand],
    ) -> None:
        with self._lock():
            file_path, line_idx = self._find_item(command.item_id)
            if file_path is None:
                raise ValueError(f"Item {command.item_id.value} not found")

            lines = file_path.read_text(encoding="utf-8").splitlines(keepends=True)
            line = lines[line_idx]

            if isinstance(command, (ApproveCommand, DropCommand)):
                line = line.replace("- [ ]", "- [x]", 1)
            elif isinstance(command, ChangePriorityCommand):
                value = command.new_priority.name.lower()
                line = self._set_inline_field(line, "priority", value)
            elif isinstance(command, DeferCommand):
                due = (date.today() + timedelta(days=command.days)).isoformat()
                line = self._set_inline_field(line, "due", due)

            lines[line_idx] = line
            self._write_atomic(file_path, "".join(lines))

    def create_item(self, command: CreateCommand) -> None:
        file_path = command.file_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        parts = [f"- [ ] {command.text}"]
        parts.append(f"[priority:: {command.priority.name.lower()}]")
        parts.append(f"[context:: {self._context_value(command.context)}]")
        if command.due:
            parts.append(f"[due:: {command.due.isoformat()}]")
        new_line = " ".join(parts) + "\n"

        with self._lock():
            existing = file_path.read_text(encoding="utf-8") if file_path.exists() else ""
            if existing:
                content = existing.rstrip("\n") + "\n" + new_line
            else:
                content = new_line
            self._write_atomic(file_path, content)

    def _find_item(self, item_id: ItemId) -> tuple[Path | None, int]:
        """Find the file and line index for an item by its ItemId.

        Searches first by ^block-id, then by content hash match.
        """
        for md_file in self._vault_root.rglob("*.md"):
            lines = md_file.read_text(encoding="utf-8").splitlines()
            for i, line in enumerate(lines):
                task_m = _TASK_RE.match(line.strip())
                if not task_m:
                    continue

                raw_text = task_m.group(3)
                if raw_text.startswith("] "):
                    raw_text = raw_text[2:]

                block_match = _BLOCK_ID_RE.search(raw_text)
                if block_match and block_match.group(1) == item_id.value:
                    return md_file, i

                task_text = normalize_task_text(raw_text)
                content_hash = hashlib.sha256(
                    f"{md_file.stem}|{task_text}".encode()
                ).hexdigest()
                if content_hash == item_id.value:
                    return md_file, i

        return None, -1

    def _set_inline_field(self, line: str, key: str, value: str) -> str:
        updated, replaced = replace_inline_field(line, key, value)
        if replaced:
            return updated

        newline = "\n" if line.endswith("\n") else ""
        body = line.rstrip("\n").rstrip()
        if body:
            body += " "
        body += f"[{key}:: {value}]"
        return body + newline

    @staticmethod
    def _context_value(ctx: Context) -> str:
        return ctx.name.lower().replace("_", "-")

    def _write_atomic(self, file_path: Path, content: str) -> None:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(prefix=file_path.name, dir=str(file_path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as tmp:
                tmp.write(content)
                tmp.flush()
                os.fsync(tmp.fileno())
            os.replace(tmp_path, file_path)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except FileNotFoundError:
                    pass

    @contextmanager
    def _lock(self) -> Iterator[None]:
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._lock_path, "a+", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
