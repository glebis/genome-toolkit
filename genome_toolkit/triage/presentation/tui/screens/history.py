"""History screen: past triage sessions with decision tables."""

from __future__ import annotations

from pathlib import Path

from textual.widget import Widget
from textual.widgets import Static, DataTable
from textual.app import ComposeResult
from textual.containers import VerticalScroll, Vertical
from rich.text import Text

from genome_toolkit.triage.presentation.tui.stub_data import (
    make_sample_history,
    TriageSessionStub,
)


ACTION_STYLES = {
    "approve": "green",
    "defer": "yellow",
    "drop": "red",
    "create": "blue",
}


class SessionPanel(Widget):
    """Renders a single triage session with its decisions."""

    DEFAULT_CSS = """
    SessionPanel {
        width: 1fr;
        height: auto;
        margin: 0 0 2 0;
        padding: 1 2;
        border: solid $secondary;
        background: $surface;
    }

    SessionPanel .session-header {
        width: 1fr;
        height: 2;
        text-style: bold;
        padding: 0 0 1 0;
    }

    SessionPanel .session-summary {
        width: 1fr;
        height: auto;
        margin: 1 0 0 0;
        color: $text-muted;
    }

    SessionPanel DataTable {
        width: 1fr;
        height: auto;
    }
    """

    def __init__(self, session: TriageSessionStub, **kwargs) -> None:
        super().__init__(**kwargs)
        self.session = session

    def compose(self) -> ComposeResult:
        with Vertical():
            header_text = Text(f"Session: {self.session.timestamp}", style="bold")
            yield Static(header_text, classes="session-header")

            table = DataTable()
            table.add_columns("Action", "Item", "Score", "From", "To", "Note")
            for d in self.session.decisions:
                action_style = ACTION_STYLES.get(d["action"], "white")
                table.add_row(
                    Text(d["action"], style=action_style),
                    d["item"],
                    d["score"],
                    d["from"],
                    d["to"],
                    d.get("note", ""),
                )
            yield table

            yield Static(
                Text(self.session.summary, style="dim italic"),
                classes="session-summary",
            )


class HistoryScreen(Widget):
    """Shows past triage sessions with decision tables."""

    DEFAULT_CSS = """
    HistoryScreen {
        width: 1fr;
        height: 1fr;
    }

    HistoryScreen .history-header {
        width: 1fr;
        height: 3;
        padding: 1 2;
        text-style: bold;
    }
    """

    def __init__(self, vault_path: Path | None = None, **kwargs) -> None:
        super().__init__(**kwargs)
        self._vault_path = vault_path
        self._sessions: list[TriageSessionStub] | None = None

        if vault_path is not None:
            self._load_real_sessions()

    def _load_real_sessions(self) -> None:
        """Load real session history from MarkdownSessionRepository."""
        try:
            from genome_toolkit.triage.infrastructure.persistence.session_store import (
                MarkdownSessionRepository,
            )

            repo = MarkdownSessionRepository(self._vault_path)
            domain_sessions = repo.get_recent(limit=10)

            self._sessions = []
            for ds in domain_sessions:
                decisions = []
                for d in ds.decisions:
                    decisions.append({
                        "action": d.action.value.lower(),
                        "item": d.item_id.value,
                        "score": "",
                        "from": self._snapshot_str(d.previous),
                        "to": self._snapshot_str(d.new),
                        "note": d.note or "",
                    })
                action_counts: dict[str, int] = {}
                for dec in decisions:
                    action_counts[dec["action"]] = action_counts.get(dec["action"], 0) + 1
                parts = [f"{v} {k}" for k, v in sorted(action_counts.items())]
                summary = f"{len(decisions)} actions ({', '.join(parts)})."

                self._sessions.append(TriageSessionStub(
                    timestamp=ds.timestamp.strftime("%Y-%m-%d %H:%M"),
                    decisions=decisions,
                    summary=summary,
                ))
        except Exception:
            import logging
            logging.getLogger(__name__).exception("Failed to load session history")
            self._sessions = None

    @staticmethod
    def _snapshot_str(snap) -> str:
        """Format a state snapshot for display."""
        parts: list[str] = []
        if snap.priority is not None:
            parts.append(snap.priority.name.lower())
        if snap.context is not None:
            parts.append(snap.context.name.lower().replace("_", "-"))
        if snap.due is not None:
            parts.append(f"due:{snap.due.isoformat()}")
        if snap.completed:
            parts.append("completed")
        return "/".join(parts) if parts else "\u2014"

    def refresh_data(self) -> None:
        """Reload sessions from vault and recompose."""
        if self._vault_path:
            self._load_real_sessions()
        self.remove_children()
        self.mount(self._build_content())

    def _build_content(self) -> VerticalScroll:
        """Build the history content widget."""
        sessions = self._sessions if self._sessions is not None else make_sample_history()
        container = VerticalScroll()
        # Content will be composed when mounted
        self._current_sessions = sessions
        return container

    def compose(self) -> ComposeResult:
        sessions = self._sessions if self._sessions is not None else make_sample_history()
        with VerticalScroll():
            header_text = Text(
                f"Triage History ({len(sessions)} sessions)",
                style="bold",
            )
            yield Static(header_text, classes="history-header")
            if not sessions:
                yield Static(Text("No triage sessions yet. Approve items and click Apply.", style="dim"))
            for session in sessions:
                yield SessionPanel(session)
