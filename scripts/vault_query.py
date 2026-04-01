#!/usr/bin/env python3
"""
Vault Query — SQL-like queries over Obsidian frontmatter.

Parses all .md files via vault_parser, extracts YAML frontmatter, and provides
filtering, sorting, and aggregation. Replaces Dataview for CLI use.

Usage:
    python3 scripts/vault_query.py "type=gene AND sensitivity"
    python3 scripts/vault_query.py "type=gene" --fields gene_symbol,evidence_tier --sort evidence_tier
    python3 scripts/vault_query.py "type=gene AND NOT sensitivity" --fields system_name,coverage
    python3 scripts/vault_query.py "evidence_tier=E1" --count
    python3 scripts/vault_query.py "sensitivity=cannabis" --fields file
    python3 scripts/vault_query.py --stats
    python3 scripts/vault_query.py --schema
    python3 scripts/vault_query.py "type=gene" --json
"""

import re
import sys
import json
import argparse
from pathlib import Path
from collections import defaultdict, Counter

# Ensure scripts/lib is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.config import VAULT_ROOT
from lib.vault_parser import iter_vault_notes, VaultNote


# ---------------------------------------------------------------------------
# Vault scanner — adapts VaultNote to flat dict (matching original format)
# ---------------------------------------------------------------------------
EXCLUDE_DIRS = {"Templates", "data", ".obsidian", ".trash", ".claude",
                ".enzyme", ".enzyme-embeddings"}


def scan_vault():
    """Scan all .md files via vault_parser and return list of flat dicts."""
    notes = []
    for note in iter_vault_notes(VAULT_ROOT, exclude_dirs=EXCLUDE_DIRS):
        fm = dict(note.frontmatter)
        rel_path = str(note.path.relative_to(VAULT_ROOT))
        fm["_file"] = rel_path
        fm["_name"] = note.name
        fm["_folder"] = str(note.path.relative_to(VAULT_ROOT).parent)

        # Word count from body
        fm["_words"] = len(note.body.split()) if note.body else 0

        # Outgoing wikilinks count
        fm["_links_out"] = len(note.wikilinks)

        notes.append(fm)

    return notes


# ---------------------------------------------------------------------------
# Query engine
# ---------------------------------------------------------------------------
def evaluate_condition(note, condition):
    """Evaluate a single condition against a note's frontmatter."""
    condition = condition.strip()

    # NOT prefix
    if condition.startswith("NOT "):
        return not evaluate_condition(note, condition[4:])

    # field=value
    m = re.match(r'^([a-zA-Z_][a-zA-Z0-9_-]*)\s*([=!<>~]+)\s*(.+)$', condition)
    if m:
        field, op, value = m.group(1), m.group(2), m.group(3).strip().strip('"').strip("'")

        # Special fields
        if field == "file":
            field = "_file"
        elif field == "name":
            field = "_name"
        elif field == "folder":
            field = "_folder"
        elif field == "words":
            field = "_words"

        note_val = note.get(field)

        if op == "=":
            if isinstance(note_val, list):
                return value in note_val
            return str(note_val).lower() == value.lower()
        elif op == "!=":
            if isinstance(note_val, list):
                return value not in note_val
            return str(note_val).lower() != value.lower()
        elif op == "~":
            # Contains / regex match
            if isinstance(note_val, list):
                return any(value.lower() in str(v).lower() for v in note_val)
            return value.lower() in str(note_val).lower() if note_val else False
        elif op == ">":
            try:
                return float(note_val) > float(value)
            except (TypeError, ValueError):
                return str(note_val) > value
        elif op == "<":
            try:
                return float(note_val) < float(value)
            except (TypeError, ValueError):
                return str(note_val) < value
        elif op == ">=":
            try:
                return float(note_val) >= float(value)
            except (TypeError, ValueError):
                return str(note_val) >= value
        elif op == "<=":
            try:
                return float(note_val) <= float(value)
            except (TypeError, ValueError):
                return str(note_val) <= value

    # Bare field name = check existence / truthiness
    field = condition
    if field == "file":
        field = "_file"
    val = note.get(field)
    if val is None:
        return False
    if isinstance(val, list):
        return len(val) > 0
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return len(val) > 0
    return True


def apply_query(notes, query_str):
    """Apply a query string with AND/OR logic."""
    if not query_str:
        return notes

    # Split by OR first, then AND within each OR clause
    or_clauses = [c.strip() for c in query_str.split(" OR ")]

    results = []
    for note in notes:
        match = False
        for or_clause in or_clauses:
            and_conditions = [c.strip() for c in or_clause.split(" AND ")]
            if all(evaluate_condition(note, cond) for cond in and_conditions):
                match = True
                break
        if match:
            results.append(note)

    return results


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------
def format_table(notes, fields, max_width=50):
    """Format notes as an aligned text table."""
    if not notes:
        return "No results."

    # Resolve field names
    resolved = []
    for f in fields:
        if f == "file":
            resolved.append("_file")
        elif f == "name":
            resolved.append("_name")
        elif f == "folder":
            resolved.append("_folder")
        elif f == "words":
            resolved.append("_words")
        elif f == "links":
            resolved.append("_links_out")
        else:
            resolved.append(f)

    # Build header
    headers = [f.lstrip("_") for f in resolved]

    # Build rows
    rows = []
    for note in notes:
        row = []
        for f in resolved:
            val = note.get(f, "")
            if isinstance(val, list):
                val = ", ".join(str(v) for v in val[:5])
                if len(note.get(f, [])) > 5:
                    val += f" (+{len(note[f])-5})"
            elif isinstance(val, bool):
                val = "Yes" if val else "No"
            else:
                val = str(val) if val is not None else ""
            if len(val) > max_width:
                val = val[:max_width-3] + "..."
            row.append(val)
        rows.append(row)

    # Calculate column widths
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))

    # Format
    sep = "  "
    lines = []
    header_line = sep.join(h.ljust(w) for h, w in zip(headers, widths))
    lines.append(header_line)
    lines.append(sep.join("-" * w for w in widths))
    for row in rows:
        lines.append(sep.join(cell.ljust(w) for cell, w in zip(row, widths)))

    lines.append(f"\n({len(notes)} results)")
    return "\n".join(lines)


def vault_stats(notes):
    """Print vault-wide statistics."""
    types = Counter(n.get("type", "untyped") for n in notes)
    tiers = Counter()
    sensitivity_count = 0
    total_words = 0
    total_links = 0

    for n in notes:
        tier = n.get("evidence_tier", "")
        if tier:
            tiers[str(tier)] += 1
        if n.get("sensitivity"):
            sensitivity_count += 1
        total_words += n.get("_words", 0)
        total_links += n.get("_links_out", 0)

    lines = [
        "=" * 60,
        "VAULT STATISTICS",
        "=" * 60,
        f"Total notes:       {len(notes)}",
        f"Total words:       {total_words:,}",
        f"Total wikilinks:   {total_links:,}",
        f"Avg words/note:    {total_words // max(len(notes), 1)}",
        f"Avg links/note:    {total_links / max(len(notes), 1):.1f}",
        f"Sensitive notes:   {sensitivity_count}",
        "",
        "BY TYPE:",
    ]
    for t, c in sorted(types.items(), key=lambda x: -x[1]):
        lines.append(f"  {t:25s} {c:4d}")

    lines.append("")
    lines.append("BY EVIDENCE TIER:")
    for t, c in sorted(tiers.items()):
        lines.append(f"  {t:25s} {c:4d}")

    # Folders
    folders = Counter(n.get("_folder", "") for n in notes)
    lines.append("")
    lines.append("BY FOLDER:")
    for f, c in sorted(folders.items(), key=lambda x: -x[1]):
        lines.append(f"  {f:25s} {c:4d}")

    return "\n".join(lines)


def vault_schema(notes):
    """Print all frontmatter keys and their frequency."""
    keys = Counter()
    key_types = defaultdict(set)
    key_examples = defaultdict(list)

    for n in notes:
        for k, v in n.items():
            if k.startswith("_"):
                continue
            keys[k] += 1
            key_types[k].add(type(v).__name__)
            if len(key_examples[k]) < 3:
                if isinstance(v, list):
                    key_examples[k].append(str(v[:2]))
                else:
                    s = str(v)
                    key_examples[k].append(s[:40])

    lines = [
        "=" * 80,
        "FRONTMATTER SCHEMA",
        "=" * 80,
        f"{'Key':30s} {'Count':6s} {'Types':15s} {'Examples'}",
        "-" * 80,
    ]
    for k, c in sorted(keys.items(), key=lambda x: -x[1]):
        types_str = "/".join(sorted(key_types[k]))
        examples = " | ".join(key_examples[k])
        lines.append(f"{k:30s} {c:5d}  {types_str:15s} {examples}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Query Obsidian vault frontmatter",
        epilog="""
Examples:
  vault_query.py "type=gene"
  vault_query.py "type=gene AND NOT sensitivity" --fields gene_symbol,evidence_tier
  vault_query.py "type=system" --fields system_name,coverage --sort coverage
  vault_query.py "sensitivity=cannabis" --fields file,name
  vault_query.py "evidence_tier~E1" --count
  vault_query.py "folder=Research AND actionable_findings=true"
  vault_query.py "_words>500" --fields name,_words --sort _words --desc
  vault_query.py --stats
  vault_query.py --schema
        """,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("query", nargs="?", default=None,
                        help="Query: field=value AND/OR conditions")
    parser.add_argument("--fields", "-f", default="name,type,evidence_tier",
                        help="Comma-separated fields to display (default: name,type,evidence_tier)")
    parser.add_argument("--sort", "-s", default=None,
                        help="Sort by field")
    parser.add_argument("--desc", action="store_true",
                        help="Sort descending")
    parser.add_argument("--limit", "-l", type=int, default=None,
                        help="Limit results")
    parser.add_argument("--count", "-c", action="store_true",
                        help="Just print count")
    parser.add_argument("--json", "-j", action="store_true",
                        help="Output as JSON")
    parser.add_argument("--stats", action="store_true",
                        help="Print vault statistics")
    parser.add_argument("--schema", action="store_true",
                        help="Print frontmatter schema")
    parser.add_argument("--group", "-g", default=None,
                        help="Group by field and count")

    args = parser.parse_args()

    # Scan vault
    notes = scan_vault()

    if args.stats:
        print(vault_stats(notes))
        return

    if args.schema:
        print(vault_schema(notes))
        return

    # Apply query
    results = apply_query(notes, args.query)

    # Group by
    if args.group:
        groups = Counter()
        for n in results:
            val = n.get(args.group, "unset")
            if isinstance(val, list):
                for v in val:
                    groups[str(v)] += 1
            else:
                groups[str(val)] += 1
        for k, c in sorted(groups.items(), key=lambda x: -x[1]):
            print(f"  {k:40s} {c:4d}")
        print(f"\n({len(results)} notes, {len(groups)} groups)")
        return

    # Sort
    if args.sort:
        sort_field = args.sort
        if sort_field == "file":
            sort_field = "_file"
        elif sort_field == "name":
            sort_field = "_name"
        elif sort_field == "words":
            sort_field = "_words"

        def sort_key(n):
            v = n.get(sort_field, "")
            if isinstance(v, (int, float)):
                return v
            return str(v).lower()

        results.sort(key=sort_key, reverse=args.desc)

    # Limit
    if args.limit:
        results = results[:args.limit]

    # Output
    if args.count:
        print(len(results))
        return

    if args.json:
        # Clean internal fields for JSON output
        clean = []
        for n in results:
            clean.append({k: v for k, v in n.items()})
        print(json.dumps(clean, indent=2, ensure_ascii=False, default=str))
        return

    fields = [f.strip() for f in args.fields.split(",")]
    print(format_table(results, fields))


if __name__ == "__main__":
    main()
