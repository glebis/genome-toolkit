"""Stub data for TUI development while application layer is built in parallel."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta


@dataclass
class ScoredItemStub:
    text: str
    score: float
    bucket: str
    priority: str
    context: str
    due: date | None = None
    evidence_tier: str | None = None
    severity: str | None = None
    linked_genes: list[str] = field(default_factory=list)
    lab_signal: str | None = None
    breakdown: dict[str, float] = field(default_factory=dict)
    clinically_validated: bool = False
    blocked_by: list[str] = field(default_factory=list)
    source_file: str = ""


PRIORITY_ORDER = ["critical", "high", "medium", "low"]

CONTEXT_ORDER = ["prescriber", "testing", "monitoring", "research", "vault-maintenance"]


def make_sample_items() -> list[ScoredItemStub]:
    """Create 15 sample items across all contexts and buckets."""
    today = date.today()
    return [
        # DO_NOW items (score >= 70)
        ScoredItemStub(
            text="Request CRP blood test from prescriber",
            score=92.0,
            bucket="DO_NOW",
            priority="critical",
            context="prescriber",
            due=today - timedelta(days=3),
            evidence_tier="E1",
            severity="significant",
            linked_genes=["IL6", "IL1B"],
            lab_signal="CRP > 5.0 mg/L (z=2.1)",
            breakdown={
                "priority": 25.0,
                "overdue": 17.0,
                "evidence": 15.0,
                "lab_signal": 14.0,
                "context": 10.0,
                "severity": 7.5,
                "stuck": 3.5,
            },
            clinically_validated=False,
        ),
        ScoredItemStub(
            text="Discuss nortriptyline with prescriber (CYP2D6 reduced activity)",
            score=85.0,
            bucket="DO_NOW",
            priority="high",
            context="prescriber",
            due=today + timedelta(days=2),
            evidence_tier="E1",
            severity="significant",
            linked_genes=["CYP2D6"],
            breakdown={
                "priority": 18.75,
                "overdue": 4.0,
                "evidence": 15.0,
                "lab_signal": 0.0,
                "context": 10.0,
                "severity": 7.5,
                "stuck": 0.0,
            },
            clinically_validated=True,
        ),
        ScoredItemStub(
            text="Schedule ferritin recheck (HFE carrier, last test 8 months ago)",
            score=78.0,
            bucket="DO_NOW",
            priority="high",
            context="testing",
            due=today - timedelta(days=10),
            evidence_tier="E1",
            severity="moderate",
            linked_genes=["HFE"],
            lab_signal="Ferritin trending up",
            breakdown={
                "priority": 18.75,
                "overdue": 17.0,
                "evidence": 15.0,
                "lab_signal": 10.0,
                "context": 8.0,
                "severity": 5.0,
                "stuck": 1.65,
            },
        ),
        # THIS_WEEK items (score 50-69)
        ScoredItemStub(
            text="Order clinical CYP2D6 sequencing to confirm *4/*10",
            score=67.0,
            bucket="THIS_WEEK",
            priority="high",
            context="testing",
            due=today + timedelta(days=5),
            evidence_tier="E1",
            severity="significant",
            linked_genes=["CYP2D6"],
            breakdown={
                "priority": 18.75,
                "overdue": 4.0,
                "evidence": 15.0,
                "lab_signal": 0.0,
                "context": 8.0,
                "severity": 7.5,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Set up quarterly HRV monitoring protocol",
            score=58.0,
            bucket="THIS_WEEK",
            priority="medium",
            context="monitoring",
            due=today + timedelta(days=14),
            evidence_tier="E2",
            severity="moderate",
            linked_genes=["COMT", "FKBP5"],
            breakdown={
                "priority": 12.5,
                "overdue": 4.0,
                "evidence": 12.0,
                "lab_signal": 0.0,
                "context": 6.0,
                "severity": 5.0,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Review PNPLA3 dietary protocol adherence",
            score=55.0,
            bucket="THIS_WEEK",
            priority="medium",
            context="monitoring",
            due=today + timedelta(days=7),
            evidence_tier="E2",
            severity="significant",
            linked_genes=["PNPLA3"],
            breakdown={
                "priority": 12.5,
                "overdue": 4.0,
                "evidence": 12.0,
                "lab_signal": 0.0,
                "context": 6.0,
                "severity": 7.5,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Update [[FADS1]] gene note with imputed variants",
            score=52.0,
            bucket="THIS_WEEK",
            priority="medium",
            context="vault-maintenance",
            due=None,
            evidence_tier="E2",
            linked_genes=["FADS1", "FADS2"],
            breakdown={
                "priority": 12.5,
                "overdue": 8.0,
                "evidence": 12.0,
                "lab_signal": 0.0,
                "context": 2.0,
                "severity": 6.0,
                "stuck": 1.65,
            },
        ),
        # BACKLOG items (score 30-49)
        ScoredItemStub(
            text="Research sodium butyrate for IBS-D management",
            score=45.0,
            bucket="BACKLOG",
            priority="medium",
            context="research",
            due=today + timedelta(days=30),
            evidence_tier="E3",
            linked_genes=["IL1B"],
            breakdown={
                "priority": 12.5,
                "overdue": 0.0,
                "evidence": 9.0,
                "lab_signal": 0.0,
                "context": 4.0,
                "severity": 6.0,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Investigate CRHR1 haplotype functional studies",
            score=42.0,
            bucket="BACKLOG",
            priority="low",
            context="research",
            due=None,
            evidence_tier="E4",
            linked_genes=["CRHR1"],
            breakdown={
                "priority": 6.25,
                "overdue": 8.0,
                "evidence": 6.0,
                "lab_signal": 0.0,
                "context": 4.0,
                "severity": 6.0,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Add HLA-B27 exercise protocol to vault",
            score=38.0,
            bucket="BACKLOG",
            priority="medium",
            context="vault-maintenance",
            due=None,
            evidence_tier="E2",
            linked_genes=["HLA-B27"],
            breakdown={
                "priority": 12.5,
                "overdue": 8.0,
                "evidence": 12.0,
                "lab_signal": 0.0,
                "context": 2.0,
                "severity": 3.0,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Wire OPRM1 gene note to reward phenotype",
            score=35.0,
            bucket="BACKLOG",
            priority="low",
            context="vault-maintenance",
            due=None,
            evidence_tier="E3",
            linked_genes=["OPRM1"],
            breakdown={
                "priority": 6.25,
                "overdue": 8.0,
                "evidence": 9.0,
                "lab_signal": 0.0,
                "context": 2.0,
                "severity": 6.0,
                "stuck": 0.0,
            },
        ),
        # CONSIDER_DROPPING items (score < 30)
        ScoredItemStub(
            text="Review DRD4 novelty-seeking literature (GWAS null)",
            score=22.0,
            bucket="CONSIDER_DROPPING",
            priority="low",
            context="research",
            due=None,
            evidence_tier="E5",
            linked_genes=["DRD4"],
            breakdown={
                "priority": 6.25,
                "overdue": 8.0,
                "evidence": 3.0,
                "lab_signal": 0.0,
                "context": 4.0,
                "severity": 3.0,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Explore telomere length PRS (low utility)",
            score=18.0,
            bucket="CONSIDER_DROPPING",
            priority="low",
            context="research",
            due=None,
            evidence_tier="E5",
            linked_genes=[],
            breakdown={
                "priority": 6.25,
                "overdue": 8.0,
                "evidence": 3.0,
                "lab_signal": 0.0,
                "context": 4.0,
                "severity": 3.0,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Document NPY rs16139 protective role",
            score=25.0,
            bucket="CONSIDER_DROPPING",
            priority="low",
            context="vault-maintenance",
            due=None,
            evidence_tier="E3",
            linked_genes=["NPY"],
            breakdown={
                "priority": 6.25,
                "overdue": 8.0,
                "evidence": 9.0,
                "lab_signal": 0.0,
                "context": 2.0,
                "severity": 3.0,
                "stuck": 0.0,
            },
        ),
        ScoredItemStub(
            text="Check PubMed for CNR1 dependence risk updates",
            score=28.0,
            bucket="CONSIDER_DROPPING",
            priority="low",
            context="research",
            due=today + timedelta(days=60),
            evidence_tier="E3",
            linked_genes=["CNR1"],
            breakdown={
                "priority": 6.25,
                "overdue": 0.0,
                "evidence": 9.0,
                "lab_signal": 0.0,
                "context": 4.0,
                "severity": 3.0,
                "stuck": 3.3,
            },
        ),
    ]


def make_sample_suggestions() -> list[ScoredItemStub]:
    """Create sample suggestions for the Suggestions tab."""
    return [
        ScoredItemStub(
            text="Add SSRI augmentation protocol based on IL1B finding",
            score=0.0,
            bucket="SUGGESTION",
            priority="high",
            context="prescriber",
            evidence_tier="E3",
            linked_genes=["IL1B"],
            breakdown={},
        ),
        ScoredItemStub(
            text="Research stale: FADS1/2 omega-3 metabolism (last checked 7 months ago)",
            score=0.0,
            bucket="SUGGESTION",
            priority="medium",
            context="research",
            evidence_tier="E2",
            linked_genes=["FADS1", "FADS2"],
            breakdown={},
        ),
        ScoredItemStub(
            text="Create protocol for HFE carrier iron monitoring",
            score=0.0,
            bucket="SUGGESTION",
            priority="high",
            context="monitoring",
            evidence_tier="E1",
            linked_genes=["HFE"],
            breakdown={},
        ),
    ]


@dataclass
class TriageSessionStub:
    timestamp: str
    decisions: list[dict[str, str]]
    summary: str


def make_sample_history() -> list[TriageSessionStub]:
    """Create sample history sessions."""
    return [
        TriageSessionStub(
            timestamp="2026-03-31 14:30",
            decisions=[
                {
                    "action": "defer",
                    "item": "Request CRP blood test",
                    "score": "82",
                    "from": "due:2026-04-01",
                    "to": "due:2026-04-08",
                    "note": "waiting for appointment",
                },
                {
                    "action": "approve",
                    "item": "Order CYP2D6 sequencing",
                    "score": "67",
                    "from": "high/testing",
                    "to": "high/testing",
                    "note": "",
                },
            ],
            summary="2 actions (1 defer, 1 approve). 15 items reviewed.",
        ),
        TriageSessionStub(
            timestamp="2026-03-28 10:00",
            decisions=[
                {
                    "action": "drop",
                    "item": "Telomere length PRS",
                    "score": "18",
                    "from": "low/research",
                    "to": "completed",
                    "note": "not actionable now",
                },
            ],
            summary="1 action (1 drop). 12 items reviewed.",
        ),
    ]
