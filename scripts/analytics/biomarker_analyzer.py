#!/usr/bin/env python3
"""Analyze biomarker lab results against genetic predictions.

Reads Biomarker Entry notes from Biomarkers/ directory, extracts marker
values and dates, compares against genetic predictions, and flags values
that cross clinical decision thresholds.

Usage:
    python3 biomarker_analyzer.py
"""
import re
import sys
from pathlib import Path
from datetime import datetime
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT, BIOMARKERS_DIR

# Clinical decision thresholds derived from genetic profile.
# Format: marker_name_lower -> list of (operator, threshold, action)
THRESHOLDS = {
    "crp": [
        (">", 3.0, "SSRI augmentation consideration (IL1B)"),
        (">", 1.0, "Anti-inflammatory intervention escalation (IL1B)"),
    ],
    "ferritin": [
        (">", 300.0, "Phlebotomy discussion (HFE het carrier)"),
    ],
    "transferrin saturation": [
        (">", 45.0, "Iron overload workup (HFE het carrier)"),
    ],
    "alt": [
        (">", 80.0, "Hepatology referral — ALT > 2x ULN (PNPLA3 G;G)"),
    ],
    "ast": [
        (">", 80.0, "Hepatology referral — AST > 2x ULN (PNPLA3 G;G)"),
    ],
    "homocysteine": [
        (">", 15.0, "Methylation support escalation (MTHFR/MTRR)"),
        (">", 10.0, "Monitor — borderline elevated (MTHFR/MTRR)"),
    ],
    "25(oh) vitamin d": [
        ("<", 30.0, "Supplement dose increase (VDR variants)"),
    ],
    "vitamin d": [
        ("<", 30.0, "Supplement dose increase (VDR variants)"),
    ],
    "ggt": [
        (">", 60.0, "Liver function follow-up (PNPLA3 G;G)"),
    ],
}


def parse_frontmatter(text: str) -> dict:
    """Extract YAML frontmatter as a simple dict (no PyYAML dependency)."""
    fm = {}
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return fm
    for line in match.group(1).splitlines():
        if ":" in line and not line.startswith("  "):
            key, _, val = line.partition(":")
            fm[key.strip()] = val.strip().strip("'\"")
    return fm


def parse_markers_from_table(text: str) -> list[dict]:
    """Parse the Results markdown table into a list of marker dicts."""
    markers = []
    table_pattern = re.compile(
        r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|",
        re.MULTILINE,
    )
    for m in table_pattern.finditer(text):
        name = m.group(1).strip()
        value_str = m.group(2).strip()
        unit = m.group(3).strip()
        reference = m.group(4).strip()
        flag = m.group(5).strip()

        # Skip header and separator rows
        if name in ("Marker", "---", "") or set(name) <= {"-", " "}:
            continue
        if set(value_str) <= {"-", " "}:
            continue

        try:
            value = float(value_str)
        except ValueError:
            continue

        markers.append({
            "name": name,
            "value": value,
            "unit": unit,
            "reference": reference,
            "flag": flag,
        })
    return markers


def parse_markers_from_frontmatter(text: str) -> list[dict]:
    """Parse markers from YAML frontmatter list (fallback)."""
    markers = []
    match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
    if not match:
        return markers

    fm_text = match.group(1)
    # Find marker blocks: lines starting with "  - name:"
    blocks = re.split(r"\n  - name:", fm_text)
    for i, block in enumerate(blocks):
        if i == 0:
            continue  # text before first marker
        lines = ("  - name:" + block).splitlines()
        marker = {}
        for line in lines:
            stripped = line.strip().lstrip("- ")
            if ":" in stripped:
                k, _, v = stripped.partition(":")
                k = k.strip()
                v = v.strip().strip("'\"")
                if k in ("name", "unit", "flag"):
                    marker[k] = v
                elif k in ("value", "reference_low", "reference_high"):
                    try:
                        marker[k] = float(v)
                    except (ValueError, TypeError):
                        pass
        if "name" in marker and "value" in marker:
            ref = ""
            if "reference_low" in marker and "reference_high" in marker:
                ref = f"{marker['reference_low']}-{marker['reference_high']}"
            markers.append({
                "name": marker["name"],
                "value": marker["value"],
                "unit": marker.get("unit", ""),
                "reference": ref,
                "flag": marker.get("flag", ""),
            })
    return markers


def check_thresholds(name: str, value: float) -> list[str]:
    """Check a marker value against clinical decision thresholds."""
    alerts = []
    key = name.lower().strip()
    for threshold_key, rules in THRESHOLDS.items():
        if threshold_key in key or key in threshold_key:
            for op, threshold, action in rules:
                if op == ">" and value > threshold:
                    alerts.append(f"  !! {name} = {value} > {threshold}: {action}")
                elif op == "<" and value < threshold:
                    alerts.append(f"  !! {name} = {value} < {threshold}: {action}")
    return alerts


def load_entries() -> list[tuple[str, str, dict, list[dict]]]:
    """Load all biomarker entry files. Returns list of (path, date, fm, markers)."""
    entries = []
    if not BIOMARKERS_DIR.exists():
        return entries

    for path in sorted(BIOMARKERS_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        test_date = fm.get("test_date", "unknown")

        # Try table first, fall back to frontmatter markers
        markers = parse_markers_from_table(text)
        if not markers:
            markers = parse_markers_from_frontmatter(text)

        if markers:
            entries.append((str(path.name), test_date, fm, markers))

    return entries


def print_trend_report(entries: list):
    """Print a trend report showing marker values over time."""
    # Group markers by name across all entries
    trends: dict[str, list[tuple[str, float, str]]] = defaultdict(list)
    for filename, date, fm, markers in entries:
        for m in markers:
            trends[m["name"]].append((date, m["value"], m["unit"]))

    print("\nTrend Report")
    print("=" * 60)
    for marker_name in sorted(trends.keys()):
        values = sorted(trends[marker_name], key=lambda x: x[0])
        print(f"\n  {marker_name}:")
        for date, val, unit in values:
            print(f"    {date}: {val} {unit}")
        if len(values) >= 2:
            first_val = values[0][1]
            last_val = values[-1][1]
            delta = last_val - first_val
            direction = "up" if delta > 0 else "down" if delta < 0 else "stable"
            print(f"    -> Trend: {direction} ({delta:+.2f})")


def print_threshold_alerts(entries: list):
    """Print any threshold crossings across all entries."""
    alerts_found = False
    print("\nClinical Threshold Alerts")
    print("=" * 60)
    for filename, date, fm, markers in entries:
        file_alerts = []
        for m in markers:
            file_alerts.extend(check_thresholds(m["name"], m["value"]))
        if file_alerts:
            alerts_found = True
            print(f"\n  {filename} ({date}):")
            for alert in file_alerts:
                print(alert)

    if not alerts_found:
        print("\n  No threshold crossings detected.")


def main():
    print(f"Biomarker Analysis Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    if not BIOMARKERS_DIR.exists():
        print(f"\nBiomarkers directory not found: {BIOMARKERS_DIR}")
        print("Create it and add lab result notes using the Biomarker Entry template.")
        sys.exit(0)

    entries = load_entries()

    if not entries:
        print("\nNo biomarker entries found in Biomarkers/.")
        print("Add lab result notes using the Biomarker Entry template.")
        print(f"  Template: Templates/Biomarker Entry.md")
        print(f"  Directory: Biomarkers/")
        print(f"  Name format: YYYY-MM-DD Lab Results.md")
        sys.exit(0)

    print(f"\nFound {len(entries)} biomarker entry/entries.")

    # Summary of latest values
    print("\nLatest Values")
    print("-" * 60)
    latest: dict[str, tuple[str, float, str, str]] = {}
    for filename, date, fm, markers in entries:
        for m in markers:
            name = m["name"]
            if name not in latest or date > latest[name][0]:
                latest[name] = (date, m["value"], m["unit"], m["flag"])

    for name in sorted(latest.keys()):
        date, val, unit, flag = latest[name]
        flag_str = f" [{flag.upper()}]" if flag and flag not in ("normal", "") else ""
        print(f"  {name:30s} {val:>8.1f} {unit:10s} ({date}){flag_str}")

    # Trends
    print_trend_report(entries)

    # Threshold alerts
    print_threshold_alerts(entries)

    print()


if __name__ == "__main__":
    main()
