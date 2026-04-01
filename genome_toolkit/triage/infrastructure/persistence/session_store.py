"""SessionRepository implementation: append-only markdown history log."""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from genome_toolkit.triage.domain.item import Context, ItemId, Priority
from genome_toolkit.triage.domain.ports.repositories import SessionRepository
from genome_toolkit.triage.domain.session import (
    Action,
    TriageDecision,
    TriageSession,
    TriageStateSnapshot,
)

_ACTION_MAP = {
    "approve": Action.APPROVE,
    "defer": Action.DEFER,
    "drop": Action.DROP,
    "change_priority": Action.CHANGE_PRIORITY,
    "create": Action.CREATE,
}


class MarkdownSessionRepository(SessionRepository):
    def __init__(self, vault_path: Path) -> None:
        self._vault_path = vault_path

    @property
    def _history_file(self) -> Path:
        return self._vault_path / "Meta" / "Triage History.md"

    def save_session(
        self,
        session: TriageSession,
        item_texts: dict[str, str] | None = None,
    ) -> None:
        """Append a triage session as a markdown table.

        Args:
            session: The triage session to save.
            item_texts: Optional mapping of item_id.value -> display text.
        """
        item_texts = item_texts or {}
        lines: list[str] = []
        timestamp_str = session.timestamp.strftime("%Y-%m-%d %H:%M")
        lines.append(f"\n## {timestamp_str}\n")
        lines.append("")
        lines.append("| Action | Item | From | To | Note |")
        lines.append("|--------|------|------|----|------|")

        action_counts: dict[str, int] = {}
        for d in session.decisions:
            action_name = d.action.value.lower()
            action_counts[action_name] = action_counts.get(action_name, 0) + 1

            from_str = self._snapshot_str(d.previous)
            to_str = self._snapshot_str(d.new)
            note = d.note or ""
            display_text = item_texts.get(d.item_id.value, d.item_id.value)[:60]
            lines.append(
                f"| {action_name} | {display_text} | {from_str} | {to_str} | {note} |"
            )

        # Session summary
        total = len(session.decisions)
        parts = [f"{v} {k}" for k, v in sorted(action_counts.items())]
        summary = ", ".join(parts)
        lines.append("")
        lines.append(f"**Session summary:** {total} actions ({summary}).")
        lines.append("")

        # Append to file
        file_path = self._history_file
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines))

    def get_recent(self, limit: int = 10) -> list[TriageSession]:
        """Parse recent sessions from the history file."""
        if not self._history_file.exists():
            return []

        text = self._history_file.read_text(encoding="utf-8")
        return self._parse_sessions(text, limit)

    def get_defer_count(self, item_id: ItemId) -> int:
        """Count how many times an item has been deferred across all sessions."""
        if not self._history_file.exists():
            return 0

        text = self._history_file.read_text(encoding="utf-8")
        count = 0
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("| defer") and item_id.value in line:
                count += 1
        return count

    def _parse_sessions(self, text: str, limit: int) -> list[TriageSession]:
        """Parse markdown session blocks into TriageSession objects."""
        sessions: list[TriageSession] = []
        lines = text.splitlines()

        i = 0
        while i < len(lines):
            line = lines[i].strip()
            # Look for session headers: ## YYYY-MM-DD HH:MM
            m = re.match(r"^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2})", line)
            if not m:
                i += 1
                continue

            timestamp = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M")
            session = TriageSession(
                session_id=m.group(1).replace(" ", "T"),
                timestamp=timestamp,
            )

            # Skip to table rows
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("| Action"):
                i += 1
            if i >= len(lines):
                break
            i += 2  # Skip header + separator

            # Parse table rows
            while i < len(lines):
                row = lines[i].strip()
                if not row.startswith("|") or row.startswith("**"):
                    break
                cells = [c.strip() for c in row.split("|")]
                if len(cells) >= 6:
                    action_str = cells[1].strip().lower()
                    action = _ACTION_MAP.get(action_str)
                    if action:
                        item_id_value = cells[2].strip()
                        note = cells[5].strip() or None
                        decision = TriageDecision(
                            item_id=ItemId(value=item_id_value),
                            action=action,
                            previous=TriageStateSnapshot(
                                priority=None, due=None, context=None, completed=False,
                            ),
                            new=TriageStateSnapshot(
                                priority=None, due=None, context=None, completed=False,
                            ),
                            note=note,
                        )
                        session.decisions.append(decision)
                i += 1

            if session.decisions:
                sessions.append(session)
            i += 1

        # Return most recent first, limited
        sessions.reverse()
        return sessions[:limit]

    @staticmethod
    def _snapshot_str(snap: TriageStateSnapshot) -> str:
        """Format a state snapshot for the markdown table."""
        parts: list[str] = []
        if snap.priority is not None:
            parts.append(snap.priority.name.lower())
        if snap.context is not None:
            parts.append(snap.context.name.lower().replace("_", "-"))
        if snap.due is not None:
            parts.append(f"due:{snap.due.isoformat()}")
        if snap.completed:
            parts.append("completed")
        return "/".join(parts) if parts else "—"
