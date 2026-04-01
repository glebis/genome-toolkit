"""Task executor -- maps triage items to executable actions."""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class AutomationLevel(Enum):
    AUTO = "auto"
    SEMI = "semi"
    MANUAL = "manual"


@dataclass
class ExecutionPlan:
    """A plan to execute a triage item."""

    item_text: str
    level: AutomationLevel
    action: str  # human-readable description
    command: str | None  # CLI command or skill invocation
    target_file: str | None  # file to modify
    context: str  # additional context for execution


# Pattern -> (level, action_template, command_template)
TASK_PATTERNS: list[tuple[str, AutomationLevel, str, str | None]] = [
    (
        r"Create (\w+) gene note",
        AutomationLevel.AUTO,
        "Create gene note for {0}",
        "/new-gene {0}",
    ),
    (
        r"Create ([\w\s]+?) note",
        AutomationLevel.SEMI,
        "Create note: {0}",
        None,
    ),
    (
        r"Update ([\w\s]+?) note",
        AutomationLevel.SEMI,
        "Update note: {0}",
        None,
    ),
    (
        r"Incorporate .* finding",
        AutomationLevel.SEMI,
        "Incorporate finding into vault",
        None,
    ),
    (
        r"Run PubMed",
        AutomationLevel.AUTO,
        "Run PubMed monitor",
        "python3 data/scripts/pubmed_monitor.py",
    ),
    (
        r"Run.*audit",
        AutomationLevel.AUTO,
        "Run vault audit",
        "/genome-audit",
    ),
    (
        r"Import lab",
        AutomationLevel.SEMI,
        "Import lab results",
        "/biomarker",
    ),
]


def classify_task(text: str, context: str) -> ExecutionPlan:
    """Classify a task and build an execution plan."""
    # Manual contexts are always manual
    if context in ("prescriber", "testing", "PRESCRIBER", "TESTING"):
        return ExecutionPlan(
            item_text=text,
            level=AutomationLevel.MANUAL,
            action=f"Track: {text}",
            command=None,
            target_file=None,
            context=context,
        )

    # Try pattern matching
    for pattern, level, action_tpl, cmd_tpl in TASK_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            groups = m.groups()
            action = action_tpl.format(*groups) if groups else action_tpl
            command = cmd_tpl.format(*groups) if cmd_tpl and groups else cmd_tpl
            return ExecutionPlan(
                item_text=text,
                level=level,
                action=action,
                command=command,
                target_file=None,
                context=context,
            )

    # Default: semi for research/monitoring/vault-maintenance, manual for rest
    if context.lower().replace("_", "-") in (
        "research",
        "monitoring",
        "vault-maintenance",
        "vault_maintenance",
    ):
        return ExecutionPlan(
            item_text=text,
            level=AutomationLevel.SEMI,
            action=f"Review and act: {text}",
            command=None,
            target_file=None,
            context=context,
        )

    return ExecutionPlan(
        item_text=text,
        level=AutomationLevel.MANUAL,
        action=f"Track: {text}",
        command=None,
        target_file=None,
        context=context,
    )


def classify_all(
    items: list[dict],
) -> dict[AutomationLevel, list[ExecutionPlan]]:
    """Classify all items and group by automation level."""
    result: dict[AutomationLevel, list[ExecutionPlan]] = {
        AutomationLevel.AUTO: [],
        AutomationLevel.SEMI: [],
        AutomationLevel.MANUAL: [],
    }
    for item in items:
        plan = classify_task(item["text"], item.get("context", ""))
        result[plan.level].append(plan)
    return result
