"""Verify a single gene note against SQLite genotypes + evidence-check."""
from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path
from typing import Any

from evidence_check.claim import Claim, ClaimType, Domain
from evidence_check.classifier import Classifier
from evidence_check.extractor import extract_claims_from_file
from evidence_check.modules.pubmed import PubMedVerifier
from evidence_check.output.json_output import render_json_report
from evidence_check.output.obsidian_note import render_obsidian_note
from evidence_check.verdict import Verdict, Status, Source


def _verify_genotypes(gene_file: Path, db_path: Path) -> list[Verdict]:
    """Verify genotype claims against SQLite database."""
    import re

    text = gene_file.read_text(encoding="utf-8")
    verdicts = []

    # Find rsID + genotype patterns
    for match in re.finditer(r"(rs\d+)\s*[\|:]\s*([ACGT];[ACGT]|[ACGT]/[ACGT])", text):
        rsid = match.group(1)
        claimed_genotype = match.group(2).replace("/", ";")
        line_num = text[:match.start()].count("\n") + 1

        claim = Claim(
            text=f"{rsid} {claimed_genotype}",
            domain=Domain.GENOMICS,
            claim_type=ClaimType.GENOTYPE,
            source_file=str(gene_file),
            source_line=line_num,
        )

        try:
            conn = sqlite3.connect(db_path)
            row = conn.execute(
                "SELECT genotype, source, r2_quality FROM snps WHERE rsid = ?",
                (rsid,),
            ).fetchone()
            conn.close()

            if row is None:
                verdicts.append(Verdict(
                    claim=claim,
                    status=Status.INSUFFICIENT_DATA,
                    confidence=0.5,
                    evidence_tier="N/A",
                    reasoning=f"{rsid} not found in database",
                ))
            elif row[0] == claimed_genotype:
                source_type = row[1] or "unknown"
                r2 = row[2]
                flags = []
                if r2 is not None and r2 < 0.8:
                    flags.append("low_imputation_quality")
                verdicts.append(Verdict(
                    claim=claim,
                    status=Status.CONFIRMED,
                    confidence=0.95 if source_type == "genotyped" else 0.7,
                    evidence_tier="E1",
                    reasoning=f"Matches database ({source_type})",
                    sources=[Source(type="sqlite", id=rsid)],
                    flags=flags,
                ))
            else:
                verdicts.append(Verdict(
                    claim=claim,
                    status=Status.CORRECTED,
                    confidence=0.95,
                    evidence_tier="E1",
                    correction=f"Database has {row[0]}, note says {claimed_genotype}",
                    sources=[Source(type="sqlite", id=rsid)],
                    flags=["genotype_mismatch"],
                ))
        except Exception as e:
            verdicts.append(Verdict(
                claim=claim,
                status=Status.INSUFFICIENT_DATA,
                confidence=0.0,
                evidence_tier="N/A",
                reasoning=f"Database error: {e}",
            ))

    return verdicts


async def _verify_claims(gene_file: Path) -> list[Verdict]:
    """Verify non-genotype claims using evidence-check modules."""
    claims = extract_claims_from_file(gene_file)
    if not claims:
        return []

    classifier = Classifier(modules=[PubMedVerifier()])
    verdicts = []
    for claim in claims:
        verdict = await classifier.classify_and_verify(claim)
        verdicts.append(verdict)

    return verdicts


async def verify_gene_note(
    gene_file: Path,
    db_path: Path,
    output: str = "obsidian",
) -> str:
    """Verify a gene note: genotypes vs SQLite + claims via evidence-check.

    Args:
        gene_file: Path to the gene .md file
        db_path: Path to genome.db SQLite database
        output: "json", "obsidian", or "markdown"

    Returns:
        Rendered verification report as string
    """
    # Genotype verification (sync, local SQLite)
    genotype_verdicts = _verify_genotypes(gene_file, db_path)

    # Claim verification (async, evidence-check)
    claim_verdicts = await _verify_claims(gene_file)

    all_verdicts = genotype_verdicts + claim_verdicts

    if output == "json":
        return render_json_report(all_verdicts, source_file=str(gene_file))
    elif output == "obsidian":
        return render_obsidian_note(all_verdicts, source_file=str(gene_file))
    else:
        from evidence_check.output.markdown_output import render_inline_report
        return render_inline_report(all_verdicts)
