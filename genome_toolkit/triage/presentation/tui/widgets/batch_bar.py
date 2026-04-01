"""Batch apply bar showing pending changes count and apply/discard actions."""

from __future__ import annotations

from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Static, Button
from textual.app import ComposeResult
from textual.containers import Horizontal
from textual.message import Message
from rich.text import Text


class BatchBar(Widget):
    """Bottom bar showing pending changes and action buttons."""

    DEFAULT_CSS = """
    BatchBar {
        width: 1fr;
        height: 3;
        padding: 0 1;
        background: $surface;
        border-top: solid $secondary;
        layout: horizontal;
    }

    BatchBar .batch-status {
        width: 1fr;
        height: 3;
        content-align: left middle;
    }

    BatchBar Button {
        min-width: 10;
        height: 3;
        margin: 0 0 0 1;
    }
    """

    pending_count: reactive[int] = reactive(0)

    class ApplyRequested(Message):
        """Posted when the apply button is clicked."""

    class DiscardRequested(Message):
        """Posted when the discard button is clicked."""

    def compose(self) -> ComposeResult:
        yield Static(self._render_status(), id="batch-status", classes="batch-status")
        yield Button("Apply", variant="success", id="apply-btn")
        yield Button("Discard", variant="error", id="discard-btn")

    def _render_status(self) -> Text:
        if self.pending_count == 0:
            return Text("No pending changes", style="dim")
        noun = "change" if self.pending_count == 1 else "changes"
        return Text(
            f"{self.pending_count} pending {noun}",
            style="bold yellow",
        )

    def watch_pending_count(self, count: int) -> None:
        """Update the status display."""
        try:
            status = self.query_one("#batch-status", Static)
            status.update(self._render_status())
        except Exception:
            pass

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "apply-btn":
            self.post_message(self.ApplyRequested())
        elif event.button.id == "discard-btn":
            self.post_message(self.DiscardRequested())

    def increment(self) -> None:
        """Add one pending change."""
        self.pending_count += 1

    def reset(self) -> None:
        """Clear all pending changes."""
        self.pending_count = 0
