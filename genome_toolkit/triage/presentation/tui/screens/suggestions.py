"""Suggestions screen: proposed new items with approve button."""

from __future__ import annotations

from textual.widget import Widget
from textual.widgets import Static, Button
from textual.app import ComposeResult
from textual.containers import VerticalScroll, Vertical, Horizontal
from textual.message import Message
from rich.text import Text

from genome_toolkit.triage.presentation.tui.stub_data import (
    make_sample_suggestions,
    ScoredItemStub,
)
from genome_toolkit.triage.presentation.tui.widgets.score_badge import BUCKET_COLORS


class SuggestionCard(Widget):
    """A card for a suggested new triage item."""

    DEFAULT_CSS = """
    SuggestionCard {
        width: 1fr;
        height: auto;
        margin: 0 0 0 0;
        padding: 0 2;
        border-bottom: solid $secondary;
        border-left: thick #3182CE;
    }

    SuggestionCard .suggestion-row {
        width: 1fr;
        height: 3;
        layout: horizontal;
    }

    SuggestionCard .suggestion-text {
        width: 1fr;
        height: 3;
        content-align: left middle;
    }

    SuggestionCard .suggestion-meta {
        width: auto;
        height: 3;
        content-align: left middle;
        color: $text-muted;
        margin: 0 2 0 0;
    }

    SuggestionCard Button {
        min-width: 10;
        height: 3;
    }
    """

    class Approved(Message):
        """Posted when a suggestion is approved."""

        def __init__(self, item: ScoredItemStub) -> None:
            self.item = item
            super().__init__()

    def __init__(self, item: ScoredItemStub, **kwargs) -> None:
        super().__init__(**kwargs)
        self.item = item

    def compose(self) -> ComposeResult:
        with Horizontal(classes="suggestion-row"):
            title_text = Text()
            title_text.append("SUGGESTED ", style="bold #3182CE")
            title_text.append(self.item.text, style="bold")
            yield Static(title_text, classes="suggestion-text")

            meta_parts = []
            if self.item.evidence_tier:
                meta_parts.append(self.item.evidence_tier)
            if self.item.linked_genes:
                meta_parts.append(", ".join(self.item.linked_genes))
            if meta_parts:
                yield Static(
                    Text(" \u00b7 ".join(meta_parts), style="dim"),
                    classes="suggestion-meta",
                )
            yield Button("Approve", variant="success", id=f"approve-{id(self.item)}")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.post_message(self.Approved(self.item))


class SuggestionsScreen(Widget):
    """Shows suggested new items with approve buttons."""

    DEFAULT_CSS = """
    SuggestionsScreen {
        width: 1fr;
        height: 1fr;
    }

    SuggestionsScreen .suggestions-header {
        width: 1fr;
        height: 3;
        padding: 1 2;
        text-style: bold;
    }
    """

    def compose(self) -> ComposeResult:
        suggestions = make_sample_suggestions()
        with VerticalScroll():
            header_text = Text(
                f"Suggested Actions ({len(suggestions)})",
                style="bold #3182CE",
            )
            yield Static(header_text, classes="suggestions-header")
            for item in suggestions:
                yield SuggestionCard(item)
