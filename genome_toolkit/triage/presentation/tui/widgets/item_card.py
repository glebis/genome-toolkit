"""Item card widget for rendering a single scored triage item."""

from __future__ import annotations

import re

from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Static
from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.message import Message
from rich.text import Text

from genome_toolkit.triage.presentation.tui.stub_data import (
    ScoredItemStub,
    PRIORITY_ORDER,
)
from genome_toolkit.triage.presentation.tui.widgets.score_badge import (
    ScoreBadge,
    BUCKET_COLORS,
    BUCKET_LABELS,
)


CONTEXT_BORDER_COLORS = {
    "prescriber": "#E53E3E",
    "testing": "#DD6B20",
    "monitoring": "#38A169",
    "research": "#3182CE",
    "vault-maintenance": "#718096",
}

# Bar rendering constants
BAR_WIDTH = 20
FULL_BLOCK = "\u2588"
EMPTY_BLOCK = "\u2591"

# Score factor labels and max weights
FACTOR_LABELS = {
    "priority": ("Priority", 25.0),
    "overdue": ("Overdue", 20.0),
    "evidence": ("Evidence", 15.0),
    "lab_signal": ("Lab", 15.0),
    "context": ("Context", 10.0),
    "severity": ("Severity", 10.0),
    "stuck": ("Stuck", 5.0),
}


def strip_wikilinks(text: str) -> str:
    """Strip [[wikilinks]] to plain text."""
    return re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)


def render_bar(value: float, max_value: float, width: int = BAR_WIDTH) -> Text:
    """Render a Unicode bar chart segment."""
    if max_value <= 0:
        ratio = 0.0
    else:
        ratio = min(value / max_value, 1.0)
    filled = int(ratio * width)
    empty = width - filled
    bar_text = Text()
    bar_text.append(FULL_BLOCK * filled, style="green")
    bar_text.append(EMPTY_BLOCK * empty, style="dim")
    bar_text.append(f"  {value:.0f}/{max_value:.0f}", style="dim")
    return bar_text


class ItemCard(Widget, can_focus=True):
    """A card widget displaying a scored triage item."""

    DEFAULT_CSS = """
    ItemCard {
        width: 1fr;
        height: auto;
        margin: 0 0 1 0;
        padding: 1 2;
        border: solid $secondary;
        background: $surface;
    }

    ItemCard:focus {
        border: double $accent;
    }

    ItemCard .card-header {
        width: 1fr;
        height: auto;
    }

    ItemCard .card-title {
        width: 1fr;
        height: auto;
    }

    ItemCard .card-meta {
        width: 1fr;
        height: 1;
        color: $text-muted;
    }

    ItemCard .card-breakdown {
        width: 1fr;
        height: auto;
        margin: 1 0 0 0;
    }

    ItemCard .card-links {
        width: 1fr;
        height: auto;
        margin: 1 0 0 0;
        color: $text-muted;
    }

    ItemCard .breakdown-row {
        width: 1fr;
        height: 1;
    }

    ItemCard.-prescriber {
        border-left: thick #E53E3E;
    }
    ItemCard.-testing {
        border-left: thick #DD6B20;
    }
    ItemCard.-monitoring {
        border-left: thick #38A169;
    }
    ItemCard.-research {
        border-left: thick #3182CE;
    }
    ItemCard.-vault-maintenance {
        border-left: thick #718096;
    }
    """

    expanded: reactive[bool] = reactive(False)

    class PriorityChanged(Message):
        """Posted when priority is cycled."""

        def __init__(self, card: ItemCard) -> None:
            self.card = card
            super().__init__()

    class ActionPerformed(Message):
        """Posted when an action (approve/defer/drop) is performed."""

        def __init__(self, card: ItemCard, action: str) -> None:
            self.card = card
            self.action = action
            super().__init__()

    def __init__(self, item: ScoredItemStub, **kwargs) -> None:
        super().__init__(**kwargs)
        self.item = item
        self.add_class(f"-{item.context}")

    def compose(self) -> ComposeResult:
        with Vertical(classes="card-header"):
            yield Horizontal(
                ScoreBadge(score=self.item.score, bucket=self.item.bucket),
                Static(self._render_title(), classes="card-title"),
            )
            yield Static(self._render_meta(), classes="card-meta")

    def _render_title(self) -> Text:
        text = Text()
        clean_text = strip_wikilinks(self.item.text)
        text.append(clean_text, style="bold")
        bucket_label = BUCKET_LABELS.get(self.item.bucket, self.item.bucket)
        color = BUCKET_COLORS.get(self.item.bucket, "#718096")
        text.append(f"  [{bucket_label}]", style=f"{color}")
        return text

    def _render_meta(self) -> Text:
        text = Text()
        parts = [self.item.priority, self.item.context]
        if self.item.due:
            parts.append(f"due {self.item.due.isoformat()}")
        if self.item.evidence_tier:
            parts.append(self.item.evidence_tier)
        if self.item.clinically_validated:
            parts.append("validated")
        text.append(" \u00b7 ".join(parts), style="dim")
        if self.item.source_file:
            text.append(f"  \u2190 {self.item.source_file}", style="dim italic")
        return text

    def _render_breakdown(self) -> ComposeResult:
        """Render score breakdown bars."""
        for key, (label, max_val) in FACTOR_LABELS.items():
            value = self.item.breakdown.get(key, 0.0)
            row_text = Text()
            row_text.append(f"{label:<9}", style="bold")
            row_text.append_text(render_bar(value, max_val))
            yield Static(row_text, classes="breakdown-row")

    def _render_links(self) -> Text:
        text = Text()
        if self.item.linked_genes:
            text.append("Linked: ", style="dim")
            text.append(", ".join(self.item.linked_genes), style="cyan")
        if self.item.lab_signal:
            if self.item.linked_genes:
                text.append("\n")
            text.append("Lab: ", style="dim")
            text.append(self.item.lab_signal, style="yellow")
        if self.item.blocked_by:
            if self.item.linked_genes or self.item.lab_signal:
                text.append("\n")
            text.append("Blocked by: ", style="dim")
            text.append(", ".join(self.item.blocked_by), style="red")
        return text

    def watch_expanded(self, expanded: bool) -> None:
        """Recompose when expand state changes."""
        self.recompose()

    def recompose(self) -> None:
        """Rebuild the widget content."""
        self.remove_children()
        self.mount(
            Vertical(
                Horizontal(
                    ScoreBadge(score=self.item.score, bucket=self.item.bucket),
                    Static(self._render_title(), classes="card-title"),
                    classes="card-header-row",
                ),
                Static(self._render_meta(), classes="card-meta"),
                classes="card-header",
            )
        )
        if self.expanded:
            breakdown_container = Vertical(classes="card-breakdown")
            self.mount(breakdown_container)
            for widget in self._render_breakdown():
                breakdown_container.mount(widget)
            links_text = self._render_links()
            if links_text.plain:
                self.mount(Static(links_text, classes="card-links"))

    def key_enter(self) -> None:
        """Toggle expand/collapse."""
        self.expanded = not self.expanded

    def key_p(self) -> None:
        """Cycle priority."""
        current_idx = PRIORITY_ORDER.index(self.item.priority)
        next_idx = (current_idx + 1) % len(PRIORITY_ORDER)
        self.item.priority = PRIORITY_ORDER[next_idx]
        self.recompose()
        self.post_message(self.PriorityChanged(self))
        self.post_message(self.ActionPerformed(self, "priority_change"))

    def key_a(self) -> None:
        """Approve/confirm item."""
        self.styles.opacity = 0.5
        try:
            self.query_one(".card-title", Static).update(
                Text(self.item.text, style="dim strike")
            )
        except Exception:
            pass
        self.post_message(self.ActionPerformed(self, "approve"))

    def key_d(self) -> None:
        """Defer item."""
        try:
            self.query_one(".card-meta", Static).update(
                Text("DEFERRED +7 days", style="yellow bold")
            )
        except Exception:
            pass
        self.post_message(self.ActionPerformed(self, "defer"))

    def key_x(self) -> None:
        """Drop item."""
        self.styles.opacity = 0.3
        try:
            self.query_one(".card-title", Static).update(
                Text(f"DROPPED: {self.item.text}", style="dim strike red")
            )
        except Exception:
            pass
        self.post_message(self.ActionPerformed(self, "drop"))
