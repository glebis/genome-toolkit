#!/usr/bin/env python3
"""Genetic Prediction Accuracy Tracker.

Compares genetic predictions against actual biomarker measurements
to score prediction accuracy. Reads biomarker entries from Biomarkers/
directory and scores each genetic prediction as CONFIRMED, REFUTED,
INCONCLUSIVE, or NOT_MEASURED.

Usage:
    python3 prediction_tracker.py
"""
import re
import sys
from pathlib import Path
from datetime import datetime

VAULT_ROOT = Path(__file__).resolve().parent.parent.parent
BIOMARKERS_DIR = VAULT_ROOT / "Biomarkers"
OUTPUT_DIR = VAULT_ROOT / "data" / "output"
RESEARCH_DIR = VAULT_ROOT / "Research"

# Genetic predictions based on personal genotype.
# Each prediction links a gene/genotype to an expected biomarker direction.
GENETIC_PREDICTIONS = [
    {
        "gene": "PNPLA3",
        "genotype": "G;G",
        "marker": "ALT",
        "direction": "high",
        "description": "ALT may trend high due to hepatic lipid accumulation",
    },
    {
        "gene": "SH2B3",
        "genotype": "C;T",
        "marker": "platelets",
        "direction": "low",
        "description": "Platelets expected low-normal due to JAK-STAT signaling variant",
    },
    {
        "gene": "HFE",
        "genotype": "A;G",
        "marker": "ferritin",
        "direction": "high",
        "description": "Ferritin may accumulate over time (hemochromatosis carrier)",
    },
    {
        "gene": "MTHFR/MTRR",
        "genotype": "compound",
        "marker": "MCV",
        "direction": "elevated",
        "description": "MCV may be elevated due to impaired methylation",
    },
    {
        "gene": "IL1B",
        "genotype": "G;G",
        "marker": "CRP",
        "direction": "elevated",
        "description": "CRP likely elevated due to pro-inflammatory IL-1beta",
    },
    {
        "gene": "VDR",
        "genotype": "variants",
        "marker": "vitamin D",
        "direction": "low",
        "description": "Vitamin D may be low due to VDR FokI/BsmI variants",
    },
]

# Mapping from prediction marker names to possible biomarker entry names.
# Handles German lab naming (Thrombozyten = platelets, GPT = ALT, etc.)
MARKER_ALIASES = {
    "ALT": ["ALT", "GPT", "GPT (ALT)", "ALAT"],
    "platelets": ["Thrombozyten", "platelets", "PLT", "Thrombocytes"],
    "ferritin": ["Ferritin", "ferritin"],
    "MCV": ["MCV"],
    "CRP": ["CRP", "C-reaktives Protein", "hs-CRP"],
    "vitamin D": ["25(OH) Vitamin D", "Vitamin D", "25-OH-Vitamin D",
                   "25(OH)D", "Vitamin D3"],
}


def load_biomarkers(biomarkers_dir: Path = None) -> list[dict]:
    """Load all biomarker entries from Biomarkers/ directory.

    Returns list of dicts sorted by date, each with keys:
        date, filename, markers (list of marker dicts)
    """
    if biomarkers_dir is None:
        biomarkers_dir = BIOMARKERS_DIR

    if not biomarkers_dir.exists():
        return []

    entries = []
    for path in sorted(biomarkers_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        fm_match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
        if not fm_match:
            continue

        fm_text = fm_match.group(1)

        # Extract test_date
        date_match = re.search(r"test_date:\s*'?\"?(\d{4}-\d{2}-\d{2})'?\"?", fm_text)
        test_date = date_match.group(1) if date_match else "unknown"

        # Parse markers from frontmatter YAML
        markers = _parse_markers_yaml(fm_text)
        if markers:
            entries.append({
                "date": test_date,
                "filename": path.name,
                "markers": markers,
            })

    entries.sort(key=lambda e: e["date"])
    return entries


def _parse_markers_yaml(fm_text: str) -> list[dict]:
    """Parse marker blocks from frontmatter YAML text."""
    markers = []
    # Split on marker entries
    blocks = re.split(r"\n  - name:", fm_text)
    for i, block in enumerate(blocks):
        if i == 0:
            continue
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
            markers.append(marker)
    return markers


def find_marker_value(markers: list[dict], prediction_marker: str) -> dict | None:
    """Find a marker measurement matching a prediction marker name.

    Uses MARKER_ALIASES to handle German/English lab naming differences.
    Returns the matching marker dict or None.
    """
    aliases = MARKER_ALIASES.get(prediction_marker, [prediction_marker])

    for marker in markers:
        marker_name = marker["name"]
        for alias in aliases:
            if alias.lower() in marker_name.lower() or marker_name.lower() in alias.lower():
                return marker
    return None


def score_prediction(direction: str, marker: dict) -> str:
    """Score a single prediction against a measurement.

    Args:
        direction: 'high', 'low', or 'elevated'
        marker: dict with 'value', 'reference_low', 'reference_high'

    Returns one of: CONFIRMED, REFUTED, INCONCLUSIVE
    """
    value = marker["value"]
    ref_low = marker.get("reference_low", 0)
    ref_high = marker.get("reference_high", value * 2)
    ref_range = ref_high - ref_low

    if ref_range == 0:
        return "INCONCLUSIVE"

    # Normalize direction
    effective_direction = direction if direction != "elevated" else "high"

    # Position within reference range (0.0 = at low end, 1.0 = at high end)
    position = (value - ref_low) / ref_range

    if effective_direction == "high":
        if position >= 0.75 or value > ref_high:
            return "CONFIRMED"
        elif position <= 0.25 or value < ref_low:
            return "REFUTED"
        else:
            return "INCONCLUSIVE"
    elif effective_direction == "low":
        if position <= 0.25 or value < ref_low:
            return "CONFIRMED"
        elif position >= 0.75 or value > ref_high:
            return "REFUTED"
        else:
            return "INCONCLUSIVE"

    return "INCONCLUSIVE"


def run_tracker(biomarkers_dir: Path = None) -> list[dict]:
    """Run the full prediction tracker pipeline.

    Returns list of result dicts with keys:
        gene, genotype, prediction, marker_name, score, value, details
    """
    entries = load_biomarkers(biomarkers_dir)

    # Build latest marker values across all entries
    latest_markers: dict[str, dict] = {}
    latest_date: dict[str, str] = {}
    for entry in entries:
        for marker in entry["markers"]:
            name = marker["name"]
            if name not in latest_date or entry["date"] > latest_date[name]:
                latest_markers[name] = marker
                latest_date[name] = entry["date"]

    all_markers = list(latest_markers.values())

    results = []
    for pred in GENETIC_PREDICTIONS:
        marker = find_marker_value(all_markers, pred["marker"])
        if marker is None:
            results.append({
                "gene": pred["gene"],
                "genotype": pred["genotype"],
                "prediction": pred["description"],
                "marker_name": pred["marker"],
                "score": "NOT_MEASURED",
                "value": None,
                "details": f"{pred['marker']} not found in any biomarker entry",
            })
        else:
            score = score_prediction(pred["direction"], marker)
            results.append({
                "gene": pred["gene"],
                "genotype": pred["genotype"],
                "prediction": pred["description"],
                "marker_name": marker["name"],
                "score": score,
                "value": marker["value"],
                "details": _format_details(pred, marker, score),
            })

    return results


def _format_details(pred: dict, marker: dict, score: str) -> str:
    """Format human-readable details for a prediction result."""
    ref_low = marker.get("reference_low", "?")
    ref_high = marker.get("reference_high", "?")
    flag = marker.get("flag", "")
    pct = ""
    if isinstance(ref_high, (int, float)) and ref_high > 0:
        pct = f" ({marker['value'] / ref_high * 100:.0f}% of ULN)"
    return (
        f"{marker['name']} = {marker['value']} "
        f"(ref {ref_low}-{ref_high}){pct} "
        f"[{flag}] -> {score}"
    )


def compute_accuracy(results: list[dict]) -> dict:
    """Compute accuracy statistics from prediction results."""
    measured = [r for r in results if r["score"] != "NOT_MEASURED"]
    confirmed = sum(1 for r in measured if r["score"] == "CONFIRMED")
    refuted = sum(1 for r in measured if r["score"] == "REFUTED")
    inconclusive = sum(1 for r in measured if r["score"] == "INCONCLUSIVE")
    total = len(measured)

    accuracy_pct = (confirmed / total * 100) if total > 0 else 0.0

    return {
        "confirmed": confirmed,
        "refuted": refuted,
        "inconclusive": inconclusive,
        "not_measured": len(results) - total,
        "total_measured": total,
        "total_predictions": len(results),
        "accuracy_pct": round(accuracy_pct, 1),
    }


def generate_report(results: list[dict]) -> str:
    """Generate a text report of prediction accuracy."""
    lines = []
    lines.append(f"Genetic Prediction Accuracy Report")
    lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("=" * 60)

    accuracy = compute_accuracy(results)

    lines.append(f"\nOverall Accuracy: {accuracy['accuracy_pct']}%")
    lines.append(f"  Confirmed:    {accuracy['confirmed']}")
    lines.append(f"  Refuted:      {accuracy['refuted']}")
    lines.append(f"  Inconclusive: {accuracy['inconclusive']}")
    lines.append(f"  Not measured: {accuracy['not_measured']}")
    lines.append(f"  Total:        {accuracy['total_predictions']}")

    lines.append("\n" + "-" * 60)
    lines.append("Detailed Results")
    lines.append("-" * 60)

    for r in results:
        icon = {
            "CONFIRMED": "[+]",
            "REFUTED": "[-]",
            "INCONCLUSIVE": "[?]",
            "NOT_MEASURED": "[ ]",
        }.get(r["score"], "[?]")

        lines.append(f"\n{icon} {r['gene']} ({r['genotype']})")
        lines.append(f"    Prediction: {r['prediction']}")
        lines.append(f"    Score:      {r['score']}")
        lines.append(f"    Details:    {r['details']}")

    return "\n".join(lines)


def generate_research_note(results: list[dict]) -> str:
    """Generate a Research note in vault format."""
    accuracy = compute_accuracy(results)
    today = datetime.now().strftime("%Y%m%d")

    lines = []
    lines.append("---")
    lines.append("type: research")
    lines.append(f"created_date: '[[{today}]]'")
    lines.append("tags:")
    lines.append("  - research")
    lines.append("  - prediction-tracking")
    lines.append("  - biomarkers")
    lines.append("genes:")
    for r in results:
        lines.append(f"  - {r['gene']}")
    lines.append("systems:")
    lines.append("  - Liver Function")
    lines.append("  - Hematologic System")
    lines.append("  - Immune & Inflammation")
    lines.append(f"actionable_findings: true")
    lines.append("---")
    lines.append("")
    lines.append(f"# Genetic Prediction Accuracy — {datetime.now().strftime('%Y-%m-%d')}")
    lines.append("")
    lines.append(f"Automated comparison of genetic predictions against biomarker measurements.")
    lines.append("")
    lines.append(f"## Summary")
    lines.append("")
    lines.append(f"- **Accuracy**: {accuracy['accuracy_pct']}% of measured predictions confirmed")
    lines.append(f"- **Confirmed**: {accuracy['confirmed']}/{accuracy['total_measured']} measured")
    lines.append(f"- **Not yet measured**: {accuracy['not_measured']}/{accuracy['total_predictions']}")
    lines.append("")
    lines.append("## Results")
    lines.append("")
    lines.append("| Gene | Genotype | Prediction | Score | Value |")
    lines.append("|------|----------|-----------|-------|-------|")
    for r in results:
        val = f"{r['value']}" if r['value'] is not None else "—"
        lines.append(f"| [[{r['gene']}]] | {r['genotype']} | {r['prediction']} | **{r['score']}** | {val} |")
    lines.append("")
    lines.append("## Interpretation")
    lines.append("")

    confirmed = [r for r in results if r["score"] == "CONFIRMED"]
    refuted = [r for r in results if r["score"] == "REFUTED"]
    not_measured = [r for r in results if r["score"] == "NOT_MEASURED"]

    if confirmed:
        lines.append("### Confirmed Predictions")
        for r in confirmed:
            lines.append(f"- **{r['gene']}**: {r['details']}")
        lines.append("")

    if refuted:
        lines.append("### Refuted Predictions")
        for r in refuted:
            lines.append(f"- **{r['gene']}**: {r['details']}")
        lines.append("")

    if not_measured:
        lines.append("### Awaiting Measurement")
        for r in not_measured:
            lines.append(f"- **{r['gene']}**: Need {r['marker_name']} measurement")
        lines.append("")

    lines.append("> [!warning] Caveat")
    lines.append("> Single timepoint. Trends require multiple measurements.")
    lines.append("> See [[Genetic Determinism - Limits and Caveats]]")

    return "\n".join(lines)


def main():
    """Run tracker against real vault and output results."""
    print(f"Genetic Prediction Accuracy Tracker")
    print(f"{'=' * 60}")

    if not BIOMARKERS_DIR.exists():
        print(f"\nBiomarkers directory not found: {BIOMARKERS_DIR}")
        sys.exit(1)

    results = run_tracker()
    report = generate_report(results)
    print(report)

    # Write output file
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / "prediction_accuracy.txt"
    output_path.write_text(report, encoding="utf-8")
    print(f"\nReport written to: {output_path}")

    # Write/update Research note
    today = datetime.now().strftime("%Y%m%d")
    research_path = RESEARCH_DIR / f"{today}-prediction-accuracy.md"
    research_note = generate_research_note(results)
    research_path.write_text(research_note, encoding="utf-8")
    print(f"Research note written to: {research_path}")


if __name__ == "__main__":
    main()
