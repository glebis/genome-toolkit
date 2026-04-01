"""CLI entry point for genome-triage.

Usage:
    python -m genome_toolkit.triage --vault ~/Brains/genome
    python -m genome_toolkit.triage --vault ~/Brains/genome --svg overview.svg
    python -m genome_toolkit.triage --vault ~/Brains/genome --interactive
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table
from rich.text import Text

from genome_toolkit.triage.domain.score import TriageBucket
from genome_toolkit.triage.domain.weights import ScoringWeights
from genome_toolkit.triage.application.triage_use_case import RunTriageSession
from genome_toolkit.triage.application.report import TriageReport
from genome_toolkit.triage.infrastructure.vault.task_parser import VaultTaskRepository
from genome_toolkit.triage.infrastructure.vault.findings_parser import VaultFindingsRepository
from genome_toolkit.triage.infrastructure.scripts.lab_adapter import VaultLabSignalRepository
from genome_toolkit.triage.infrastructure.persistence.session_store import MarkdownSessionRepository
from genome_toolkit.triage.infrastructure.config import TriageConfig
from genome_toolkit.triage.presentation.svg.renderer import (
    SvgRenderer,
    ScoredItem as SvgScoredItem,
    Suggestion as SvgSuggestion,
    TriageReport as SvgTriageReport,
)
from genome_toolkit.triage.execution.executor import (
    AutomationLevel,
    classify_all,
)

console = Console()

BUCKET_COLORS = {
    TriageBucket.DO_NOW: "red bold",
    TriageBucket.THIS_WEEK: "yellow",
    TriageBucket.BACKLOG: "dim",
    TriageBucket.CONSIDER_DROPPING: "dim italic",
}

BUCKET_LABELS = {
    TriageBucket.DO_NOW: "DO NOW",
    TriageBucket.THIS_WEEK: "This Week",
    TriageBucket.BACKLOG: "Backlog",
    TriageBucket.CONSIDER_DROPPING: "Consider Dropping",
}


def _build_report(vault_path: Path, context_filter=None, bucket_filter=None) -> TriageReport:
    """Build a triage report from the vault."""
    task_repo = VaultTaskRepository(vault_path)
    findings_repo = VaultFindingsRepository(vault_path)
    lab_repo = VaultLabSignalRepository(vault_path)
    session_repo = MarkdownSessionRepository(vault_path)

    use_case = RunTriageSession(
        task_repo=task_repo,
        findings_repo=findings_repo,
        lab_signal_repo=lab_repo,
        session_repo=session_repo,
    )
    return use_case.execute(
        context_filter=context_filter,
        bucket_filter=bucket_filter,
    )


def _to_svg_report(report: TriageReport) -> SvgTriageReport:
    """Convert application TriageReport to SVG renderer types."""
    svg_items = []
    for si in report.scored_items:
        svg_items.append(SvgScoredItem(
            text=si.item.text,
            score=si.score.value,
            bucket=si.score.bucket.name,
            priority=si.item.priority.name.lower() if si.item.priority else "unknown",
            context=si.item.context.name.lower().replace("_", "-") if si.item.context else "unknown",
            due=si.item.due.isoformat() if si.item.due else None,
            evidence_tier=si.item.evidence_tier.name if si.item.evidence_tier else None,
            breakdown={
                "priority": si.score.breakdown.priority_score,
                "overdue": si.score.breakdown.overdue_score,
                "evidence": si.score.breakdown.evidence_score,
                "lab_signal": si.score.breakdown.lab_signal_score,
                "context": si.score.breakdown.context_score,
                "severity": si.score.breakdown.severity_score,
                "stuck": si.score.breakdown.stuck_score,
            },
        ))

    svg_suggestions = [
        SvgSuggestion(
            text=s.text,
            source_type=s.source_type.name,
            rationale=s.rationale,
            recommended_priority=s.recommended_priority.name.lower(),
        )
        for s in report.suggestions
    ]

    return SvgTriageReport(
        items=svg_items,
        suggestions=svg_suggestions,
        total_items=report.total_items,
        bucket_counts={k.name: v for k, v in report.bucket_counts.items()},
    )


def _print_console_report(report: TriageReport) -> None:
    """Print a rich console table."""
    table = Table(title="Genome Triage", show_lines=False, pad_edge=True, expand=True)
    table.add_column("Score", justify="right", width=5, no_wrap=True)
    table.add_column("Bucket", width=10, no_wrap=True)
    table.add_column("Item", ratio=1, no_wrap=True, overflow="ellipsis")
    table.add_column("Pri", width=8, no_wrap=True)
    table.add_column("Context", width=14, no_wrap=True)
    table.add_column("Due", width=10, no_wrap=True)

    for si in report.scored_items:
        bucket = si.score.bucket
        style = BUCKET_COLORS.get(bucket, "")
        score_text = Text(f"{si.score.value:.0f}", style=style)
        bucket_text = Text(BUCKET_LABELS.get(bucket, bucket.name), style=style)

        table.add_row(
            score_text,
            bucket_text,
            Text(si.item.text[:50], style=style),
            si.item.priority.name.lower() if si.item.priority else "—",
            si.item.context.name.lower().replace("_", "-") if si.item.context else "—",
            si.item.due.isoformat() if si.item.due else "—",
        )

    console.print(table)
    console.print()

    # Bucket summary
    for bucket in [TriageBucket.DO_NOW, TriageBucket.THIS_WEEK, TriageBucket.BACKLOG, TriageBucket.CONSIDER_DROPPING]:
        count = report.bucket_counts.get(bucket, 0)
        label = BUCKET_LABELS[bucket]
        style = BUCKET_COLORS.get(bucket, "")
        console.print(f"  {label}: {count}", style=style)

    console.print(f"\n  Total: {report.total_items} items, {len(report.suggestions)} suggestions")

    if report.suggestions:
        console.print("\n[bold]Suggestions:[/bold]")
        for s in report.suggestions[:5]:
            console.print(f"  + {s.text} [{s.source_type.name}]", style="green")


def _save_markdown_report(report: TriageReport, vault_path: Path) -> Path:
    """Save report as markdown to vault."""
    out = vault_path / "Meta" / "Triage Report.md"
    lines = [
        "---",
        "type: meta",
        f"created_date: '{datetime.now().strftime('%Y-%m-%d')}'",
        "tags: [meta, triage]",
        "---",
        "",
        "# Triage Report",
        "",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "## Items by Score",
        "",
        "| Score | Bucket | Item | Priority | Context | Due |",
        "|-------|--------|------|----------|---------|-----|",
    ]
    for si in report.scored_items:
        score = f"{si.score.value:.0f}"
        bucket = BUCKET_LABELS.get(si.score.bucket, "")
        text = si.item.text[:50]
        pri = si.item.priority.name.lower() if si.item.priority else "—"
        ctx = si.item.context.name.lower().replace("_", "-") if si.item.context else "—"
        due = si.item.due.isoformat() if si.item.due else "—"
        lines.append(f"| {score} | {bucket} | {text} | {pri} | {ctx} | {due} |")

    if report.suggestions:
        lines.extend(["", "## Suggestions", ""])
        for s in report.suggestions:
            lines.append(f"- {s.text} — {s.rationale}")

    lines.extend(["", f"---", f"Total: {report.total_items} items"])

    out.write_text("\n".join(lines), encoding="utf-8")
    return out


LEVEL_LABELS = {
    AutomationLevel.AUTO: ("Auto-executable", "green bold"),
    AutomationLevel.SEMI: ("Needs Review", "yellow"),
    AutomationLevel.MANUAL: ("Manual", "dim"),
}


def _print_classified_report(report: TriageReport) -> None:
    """Print items grouped by automation level."""
    items_for_classify = [
        {
            "text": si.item.text,
            "score": si.score.value,
            "context": si.item.context.name if si.item.context else "",
        }
        for si in report.scored_items
    ]
    grouped = classify_all(items_for_classify)

    console.print(f"\n[bold]Triage Report ({report.total_items} items)[/bold]\n")

    for level in [AutomationLevel.AUTO, AutomationLevel.SEMI, AutomationLevel.MANUAL]:
        plans = grouped[level]
        label, style = LEVEL_LABELS[level]
        console.print(f"[{style}]### {label} ({len(plans)} items)[/{style}]")

        if not plans:
            console.print("  (none)\n")
            continue

        for i, plan in enumerate(plans, 1):
            score_item = next(
                (si for si in report.scored_items if si.item.text == plan.item_text),
                None,
            )
            score_str = f"{score_item.score.value:.0f}" if score_item else "?"

            if level == AutomationLevel.MANUAL:
                console.print(f"  - [ ] {plan.item_text} [{plan.context}]")
            else:
                cmd_str = f" -> {plan.command}" if plan.command else ""
                console.print(f"  {i}. [{score_str}] {plan.action}{cmd_str}")

        console.print()


@click.command()
@click.option("--vault", type=click.Path(exists=True, path_type=Path), required=True, help="Vault root path")
@click.option("--context", "ctx_filter", type=str, default=None, help="Filter by context (prescriber, testing, etc.)")
@click.option("--bucket", "bucket_filter", type=str, default=None, help="Filter by bucket (do-now, this-week, etc.)")
@click.option("--json-output", "json_out", is_flag=True, help="Output as JSON")
@click.option("--save", is_flag=True, help="Save report to Meta/Triage Report.md")
@click.option("--svg", "svg_path", type=click.Path(path_type=Path), default=None, help="Generate overview SVG")
@click.option("--svg-card", "svg_card_id", type=str, default=None, help="Generate score card SVG for item")
@click.option("--svg-visit", "svg_visit_path", type=click.Path(path_type=Path), default=None, help="Generate doctor visit SVG")
@click.option("--svg-dashboard", "svg_dash_path", type=click.Path(path_type=Path), default=None, help="Generate dashboard SVG")
@click.option("--interactive", is_flag=True, help="Launch TUI dashboard")
@click.option("--classify", is_flag=True, help="Show items classified by automation level")
@click.option("-o", "output_path", type=click.Path(path_type=Path), default=None, help="Output file path")
def main(
    vault: Path,
    ctx_filter: str | None,
    bucket_filter: str | None,
    json_out: bool,
    save: bool,
    svg_path: Path | None,
    svg_card_id: str | None,
    svg_visit_path: Path | None,
    svg_dash_path: Path | None,
    interactive: bool,
    classify: bool,
    output_path: Path | None,
) -> None:
    """Genome Triage — score, sort, and triage vault action items."""

    if interactive:
        from genome_toolkit.triage.presentation.tui.app import TriageApp
        app = TriageApp(vault_path=vault)
        app.run()
        return

    # Build report
    report = _build_report(vault, context_filter=ctx_filter, bucket_filter=bucket_filter)

    # SVG outputs
    renderer = SvgRenderer()
    svg_report = _to_svg_report(report)

    if svg_path:
        svg = renderer.render_overview(svg_report)
        svg_path.write_text(svg, encoding="utf-8")
        console.print(f"Overview SVG saved to {svg_path}")

    if svg_dash_path:
        svg = renderer.render_dashboard(svg_report)
        svg_dash_path.write_text(svg, encoding="utf-8")
        console.print(f"Dashboard SVG saved to {svg_dash_path}")

    if svg_visit_path:
        svg = renderer.render_visit_report(svg_report)
        svg_visit_path.write_text(svg, encoding="utf-8")
        console.print(f"Visit report SVG saved to {svg_visit_path}")

    if svg_card_id:
        matching = [i for i in svg_report.items if svg_card_id.lower() in i.text.lower()]
        if matching:
            svg = renderer.render_score_card(matching[0])
            out = output_path or Path(f"score_card_{svg_card_id[:20]}.svg")
            out.write_text(svg, encoding="utf-8")
            console.print(f"Score card SVG saved to {out}")
        else:
            console.print(f"No item matching '{svg_card_id}'", style="red")

    if save:
        out = _save_markdown_report(report, vault)
        console.print(f"Report saved to {out}")

    if classify:
        _print_classified_report(report)

    if json_out:
        data = {
            "total": report.total_items,
            "bucket_counts": {k.name: v for k, v in report.bucket_counts.items()},
            "items": [
                {
                    "text": si.item.text,
                    "score": round(si.score.value, 1),
                    "bucket": si.score.bucket.name,
                    "priority": si.item.priority.name if si.item.priority else None,
                    "context": si.item.context.name if si.item.context else None,
                    "due": si.item.due.isoformat() if si.item.due else None,
                }
                for si in report.scored_items
            ],
            "suggestions": [
                {"text": s.text, "type": s.source_type.name, "rationale": s.rationale}
                for s in report.suggestions
            ],
        }
        click.echo(json.dumps(data, indent=2))

    # Default: console table
    if not any([svg_path, svg_dash_path, svg_visit_path, svg_card_id, save, json_out, classify]):
        _print_console_report(report)


if __name__ == "__main__":
    main()
