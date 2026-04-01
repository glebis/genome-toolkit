"""Verify a protocol or report note for safety and evidence quality."""
from __future__ import annotations

import asyncio
from pathlib import Path

from evidence_check.classifier import Classifier
from evidence_check.extractor import extract_claims_from_file
from evidence_check.modules.pubmed import PubMedVerifier
from evidence_check.output.json_output import render_json_report
from evidence_check.output.obsidian_note import render_obsidian_note
from evidence_check.verdict import Verdict


async def verify_protocol(
    protocol_file: Path,
    output: str = "obsidian",
) -> str:
    """Verify a protocol/report note.

    Extracts all verifiable claims (effect sizes, drug interactions,
    treatment recommendations) and checks against PubMed.

    Args:
        protocol_file: Path to the protocol/report .md file
        output: "json", "obsidian", or "markdown"

    Returns:
        Rendered verification report as string
    """
    claims = extract_claims_from_file(protocol_file)
    if not claims:
        return "No verifiable claims found in file."

    classifier = Classifier(modules=[PubMedVerifier()])

    verdicts = []
    for claim in claims:
        verdict = await classifier.classify_and_verify(claim)
        verdicts.append(verdict)

    if output == "json":
        return render_json_report(verdicts, source_file=str(protocol_file))
    elif output == "obsidian":
        return render_obsidian_note(verdicts, source_file=str(protocol_file))
    else:
        from evidence_check.output.markdown_output import render_inline_report
        return render_inline_report(verdicts)
