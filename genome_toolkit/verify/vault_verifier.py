"""Batch-verify all gene/protocol notes in the vault."""
from __future__ import annotations

import asyncio
from pathlib import Path

from genome_toolkit.verify.gene_verifier import verify_gene_note
from genome_toolkit.verify.protocol_verifier import verify_protocol


async def verify_vault(
    vault_root: Path,
    db_path: Path,
    note_type: str = "gene",
    output: str = "obsidian",
    save: bool = False,
) -> list[str]:
    """Verify all notes of a given type in the vault.

    Args:
        vault_root: Path to the Obsidian vault root
        db_path: Path to genome.db
        note_type: "gene", "protocol", "report", or "all"
        output: "json", "obsidian", or "markdown"
        save: If True, save Obsidian notes to Meta/

    Returns:
        List of rendered reports
    """
    dirs = {
        "gene": [vault_root / "Genes"],
        "protocol": [vault_root / "Protocols"],
        "report": [vault_root / "Reports"],
        "all": [vault_root / "Genes", vault_root / "Protocols", vault_root / "Reports"],
    }

    target_dirs = dirs.get(note_type, dirs["all"])
    reports = []

    for target_dir in target_dirs:
        if not target_dir.exists():
            continue
        for md_file in sorted(target_dir.glob("*.md")):
            if md_file.name.startswith("_"):
                continue  # skip templates

            is_gene = target_dir.name == "Genes"
            if is_gene:
                report = await verify_gene_note(md_file, db_path, output)
            else:
                report = await verify_protocol(md_file, output)

            reports.append(report)

            if save and output == "obsidian":
                out_path = vault_root / "Meta" / f"Fact-Check {md_file.stem}.md"
                out_path.write_text(report, encoding="utf-8")

    return reports
