"""PubMed validator wrapper for literature verification.

Searches PubMed (via Entrez E-utilities) for publications that support or
contradict a genomic claim. The actual HTTP calls are stubbed — a real
implementation would use Bio.Entrez or the NCBI REST API.

The stub returns a pass result so the pipeline can run without network access.
"""
from __future__ import annotations

import time
from typing import Any

from scripts.lib.multi_agent import AgentResult, ValidationFlag, Severity


AGENT_NAME = "pubmed"

# Base URL for Entrez E-utilities (not used in stub but documented for implementors)
_ENTREZ_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


def validate(claim: str, context: dict[str, Any]) -> AgentResult:
    """Validate a claim by searching PubMed for supporting literature.

    Args:
        claim: The genomic/pharmacogenomic claim to verify.
        context: Supporting context dict. Recognised keys:
            - gene (str): Gene symbol (e.g. "CYP2D6").
            - pmids (list[str]): PMIDs cited in the claim.
            - max_results (int): Maximum PubMed results to retrieve (default 5).
            - validation_type (str): "gene_note" | "prescriber_report" | etc.

    Returns:
        AgentResult with status "pass"/"fail"/"error".
    """
    start = time.monotonic()

    try:
        result = _stub_search(claim, context)
    except Exception as exc:
        elapsed = int((time.monotonic() - start) * 1000)
        return AgentResult(
            agent=AGENT_NAME,
            status="error",
            flags=[],
            summary=f"PubMed search error: {exc}",
            duration_ms=elapsed,
            raw_output=str(exc),
        )

    elapsed = int((time.monotonic() - start) * 1000)
    result.duration_ms = elapsed
    return result


def _stub_search(claim: str, context: dict[str, Any]) -> AgentResult:
    """Stub implementation — returns pass without making network calls."""
    # Real implementation outline:
    #
    # query = _build_query(claim, context)
    # records = Entrez.esearch(db="pubmed", term=query, retmax=context.get("max_results", 5))
    # ids = Entrez.read(records)["IdList"]
    # if not ids:
    #     flag = ValidationFlag(
    #         severity=Severity.WARN,
    #         agent=AGENT_NAME,
    #         claim=claim,
    #         issue="No PubMed results found for claim",
    #         suggestion="Add a direct PMID citation or refine the search terms.",
    #     )
    #     return AgentResult(agent=AGENT_NAME, status="fail", flags=[flag], ...)
    # ...check cited PMIDs are in results...

    return AgentResult(
        agent=AGENT_NAME,
        status="pass",
        flags=[],
        summary="PubMed stub: literature search skipped (no network call made).",
        duration_ms=0,
        raw_output="",
    )


def _build_query(claim: str, context: dict[str, Any]) -> str:
    """Build an Entrez search query from claim and context."""
    parts = [claim[:200]]  # truncate long claims
    if context.get("gene"):
        parts.append(context["gene"] + "[Gene Name]")
    return " AND ".join(parts)
