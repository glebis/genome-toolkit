#!/usr/bin/env python3
"""Vault gap detection script.
Walks Obsidian markdown files, reports broken wikilinks, missing gene notes,
frontmatter issues, and system coverage gaps.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT as _VAULT_ROOT

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else _VAULT_ROOT
NOTE_SUFFIX = ".md"
GENE_TOKEN_RE = re.compile(r"\b[A-Z0-9]{3,7}\b")
WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")

REQUIRED_FIELDS = {
    "gene": ("gene_symbol", "evidence_tier"),
    "phenotype": ("trait", "evidence_tier"),
    "system": ("system_name", "coverage"),
    "research": ("topic",),
    "report": ("purpose",),
}


def iter_notes(root: Path) -> List[Dict[str, Any]]:
    notes = []
    for path in root.rglob(f"*{NOTE_SUFFIX}"):
        rel = path.relative_to(root)
        if any(part.startswith(".") for part in rel.parts):
            continue
        text = path.read_text(encoding="utf-8")
        frontmatter: Dict[str, Any] = {}
        body = text
        if text.startswith("---"):
            lines = text.splitlines()
            if lines and lines[0].strip() == "---":
                for i in range(1, len(lines)):
                    if lines[i].strip() == "---":
                        fm_text = "\n".join(lines[1:i])
                        frontmatter = yaml.safe_load(fm_text) or {}
                        body = "\n".join(lines[i + 1 :])
                        break
        note = {
            "path": rel,
            "name": path.stem,
            "type": frontmatter.get("type"),
            "frontmatter": frontmatter,
            "body": body,
        }
        notes.append(note)
    return notes


def clean_target(target: str) -> str:
    target = target.strip()
    if target.startswith("[[") and target.endswith("]]"):
        target = target[2:-2]
    if "|" in target:
        target = target.split("|", 1)[0]
    if "#" in target:
        target = target.split("#", 1)[0]
    return target.strip()


def extract_wikilinks(text: str) -> List[str]:
    links = []
    for raw in WIKILINK_RE.findall(text):
        links.append(clean_target(raw))
    return links


def detect_gene_tokens(text: str) -> List[str]:
    tokens = set()
    for token in GENE_TOKEN_RE.findall(text):
        if token.isupper() and not token.isdigit():
            tokens.add(token)
    return sorted(tokens)


def main() -> None:
    notes = iter_notes(ROOT)
    note_names = {note["name"] for note in notes}
    gene_notes = {
        ((note["frontmatter"] or {}).get("gene_symbol") or note["name"]).upper()
        for note in notes
        if note["type"] == "gene"
    }

    broken = Counter()
    incoming = defaultdict(set)
    for note in notes:
        links = extract_wikilinks(note["body"])
        note["links"] = links
        for target in links:
            if not target:
                continue
            norm = target.lower()
            if target in note_names:
                incoming[target].add(note["name"])
            else:
                broken[target] += 1

    missing_frontmatter = []
    for note in notes:
        required = REQUIRED_FIELDS.get(note["type"])
        if not required:
            continue
        missing = [field for field in required if not note["frontmatter"].get(field)]
        if missing:
            missing_frontmatter.append((note["path"], missing))

    system_coverage = []
    system_gene_refs = set()
    for note in notes:
        if note["type"] != "system":
            continue
        genes = note["frontmatter"].get("genes", [])
        clean_genes = [clean_target(str(g)) for g in genes if g]
        system_gene_refs.update(clean_genes)
        missing_genes = [g for g in clean_genes if g not in note_names]
        coverage = note["frontmatter"].get("coverage")
        system_coverage.append(
            {
                "system": note["name"],
                "coverage": coverage,
                "referenced_genes": clean_genes,
                "missing_gene_notes": missing_genes,
            }
        )

    phenotype_gene_refs = set()
    for note in notes:
        if note["type"] != "phenotype":
            continue
        genes = note["frontmatter"].get("contributing_genes", [])
        clean_genes = [clean_target(str(g)) for g in genes if g]
        phenotype_gene_refs.update(clean_genes)

    text_genes = set()
    for note in notes:
        text_genes.update(detect_gene_tokens(note["body"]))

    missing_gene_notes = sorted((system_gene_refs | phenotype_gene_refs | text_genes) - note_names)

    system_protocol_gaps = []
    phenotype_protocol_gaps = []
    for note in notes:
        prot = note["frontmatter"].get("protocols", [])
        if not isinstance(prot, list):
            continue
        clean_prot = [clean_target(str(p)) for p in prot if p]
        missing = [p for p in clean_prot if p and p not in note_names]
        if missing:
            row = {
                "note": str(note["path"]),
                "protocols": clean_prot,
                "missing": missing,
            }
            if note["type"] == "system":
                system_protocol_gaps.append(row)
            elif note["type"] == "phenotype":
                phenotype_protocol_gaps.append(row)

    report = {
        "root": str(ROOT),
        "note_count": len(notes),
        "unique_broken_links": len(broken),
        "broken_links": broken.most_common(),
        "missing_gene_notes": missing_gene_notes,
        "missing_frontmatter": [(str(path), fields) for path, fields in missing_frontmatter],
        "system_coverage": system_coverage,
        "system_protocol_gaps": system_protocol_gaps,
        "phenotype_protocol_gaps": phenotype_protocol_gaps,
    }

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
