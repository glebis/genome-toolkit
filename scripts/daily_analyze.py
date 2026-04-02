#!/usr/bin/env python3
"""Analyze daily health logs for patterns, correlations, and actionable insights.

Usage:
    daily_analyze.py                    # Last 14 days
    daily_analyze.py --days 30          # Last 30 days
    daily_analyze.py --json             # Machine-readable output
    daily_analyze.py --save             # Save report to vault
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

VAULT_ROOT = None


def _resolve_vault() -> Path:
    import os
    env = os.environ.get("GENOME_VAULT_ROOT")
    if env:
        return Path(env).expanduser()
    cwd = Path.cwd()
    if (cwd / "Dashboard.md").exists():
        return cwd
    home = Path.home() / "Brains" / "genome"
    if home.exists():
        return home
    return cwd


def parse_frontmatter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}

    fm = {}
    current_section = None
    current_dict = None

    for line in parts[1].strip().split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        if indent == 0 and ":" in stripped:
            key, _, val = stripped.partition(":")
            key, val = key.strip(), val.strip()
            if val in ("", "null"):
                current_section = key
                current_dict = {}
                fm[key] = current_dict
            elif val == "true":
                fm[key] = True
            elif val == "false":
                fm[key] = False
            else:
                fm[key] = val.strip("'\"")
                current_section = None
                current_dict = None
        elif indent > 0 and current_dict is not None and ":" in stripped:
            key, _, val = stripped.partition(":")
            key, val = key.strip(), val.strip()
            if val == "true":
                current_dict[key] = True
            elif val == "false":
                current_dict[key] = False
            elif val == "null":
                current_dict[key] = None
            else:
                try:
                    current_dict[key] = float(val) if "." in val else int(val)
                except ValueError:
                    current_dict[key] = val
    return fm


def load_daily_notes(vault: Path, days: int) -> list[dict]:
    daily_dir = vault / "Daily"
    if not daily_dir.exists():
        return []

    cutoff = date.today() - timedelta(days=days)
    notes = []

    for f in sorted(daily_dir.glob("*.md")):
        try:
            d = date.fromisoformat(f.stem)
        except ValueError:
            continue
        if d < cutoff:
            continue
        fm = parse_frontmatter(f.read_text(encoding="utf-8"))
        fm["_date"] = d.isoformat()
        notes.append(fm)

    return sorted(notes, key=lambda n: n["_date"])


def analyze(notes: list[dict]) -> dict:
    if not notes:
        return {"error": "No daily notes found", "days": 0}

    total_days = len(notes)
    date_range = f"{notes[0]['_date']} to {notes[-1]['_date']}"

    # --- Supplement adherence ---
    supp_taken = defaultdict(int)
    supp_total = defaultdict(int)
    for n in notes:
        for s, v in n.get("supplements", {}).items():
            supp_total[s] += 1
            if v is True:
                supp_taken[s] += 1

    adherence = {}
    for s in supp_total:
        pct = round(supp_taken[s] / supp_total[s] * 100) if supp_total[s] > 0 else 0
        adherence[s] = {"taken": supp_taken[s], "total": supp_total[s], "pct": pct}

    # --- Symptom averages and trends ---
    symptom_vals = defaultdict(list)
    symptom_by_date = defaultdict(dict)
    for n in notes:
        d = n["_date"]
        for s, v in n.get("symptoms", {}).items():
            if v is not None and isinstance(v, (int, float)):
                symptom_vals[s].append(v)
                symptom_by_date[d][s] = v

    symptom_stats = {}
    for s, vals in symptom_vals.items():
        avg = round(sum(vals) / len(vals), 1)
        mx = max(vals)
        mn = min(vals)
        # Trend: compare first half vs second half
        mid = len(vals) // 2
        if mid > 0:
            first_avg = sum(vals[:mid]) / mid
            second_avg = sum(vals[mid:]) / (len(vals) - mid)
            trend = "improving" if second_avg < first_avg - 0.5 else \
                    "worsening" if second_avg > first_avg + 0.5 else "stable"
        else:
            trend = "insufficient_data"
        symptom_stats[s] = {"avg": avg, "min": mn, "max": mx, "trend": trend, "n": len(vals)}

    # --- Intervention frequency ---
    int_done = defaultdict(int)
    int_total = defaultdict(int)
    for n in notes:
        for i, v in n.get("interventions", {}).items():
            int_total[i] += 1
            if v is True:
                int_done[i] += 1

    intervention_freq = {}
    for i in int_total:
        pct = round(int_done[i] / int_total[i] * 100) if int_total[i] > 0 else 0
        intervention_freq[i] = {"done": int_done[i], "total": int_total[i], "pct": pct}

    # --- Correlations: supplement taken vs symptom next day ---
    correlations = []
    dates = [n["_date"] for n in notes]
    for supp in supp_total:
        for symp in symptom_vals:
            with_supp = []
            without_supp = []
            for i, n in enumerate(notes[:-1]):
                next_n = notes[i + 1]
                next_symp = next_n.get("symptoms", {}).get(symp)
                if next_symp is None:
                    continue
                took = n.get("supplements", {}).get(supp)
                if took is True:
                    with_supp.append(next_symp)
                elif took is False:
                    without_supp.append(next_symp)

            if len(with_supp) >= 2 and len(without_supp) >= 2:
                avg_with = sum(with_supp) / len(with_supp)
                avg_without = sum(without_supp) / len(without_supp)
                diff = round(avg_without - avg_with, 1)
                if abs(diff) >= 1.0:
                    correlations.append({
                        "supplement": supp,
                        "symptom": symp,
                        "avg_with": round(avg_with, 1),
                        "avg_without": round(avg_without, 1),
                        "diff": diff,
                        "direction": "better" if diff > 0 else "worse",
                        "n_with": len(with_supp),
                        "n_without": len(without_supp),
                    })

    correlations.sort(key=lambda c: abs(c["diff"]), reverse=True)

    # --- Exercise + symptom correlation ---
    exercise_corr = []
    for symp in symptom_vals:
        with_ex = []
        without_ex = []
        for i, n in enumerate(notes[:-1]):
            next_n = notes[i + 1]
            next_symp = next_n.get("symptoms", {}).get(symp)
            if next_symp is None:
                continue
            exercised = n.get("interventions", {}).get("exercise")
            if exercised is True:
                with_ex.append(next_symp)
            elif exercised is False:
                without_ex.append(next_symp)

        if len(with_ex) >= 2 and len(without_ex) >= 2:
            avg_with = sum(with_ex) / len(with_ex)
            avg_without = sum(without_ex) / len(without_ex)
            diff = round(avg_without - avg_with, 1)
            if abs(diff) >= 0.5:
                exercise_corr.append({
                    "symptom": symp,
                    "avg_after_exercise": round(avg_with, 1),
                    "avg_no_exercise": round(avg_without, 1),
                    "diff": diff,
                })

    # --- Patterns ---
    patterns = []

    # GI + nasal together = histamine
    for n in notes:
        gi = n.get("symptoms", {}).get("gi_discomfort")
        nasal = n.get("symptoms", {}).get("nasal_congestion")
        if gi is not None and nasal is not None and gi >= 5 and nasal >= 5:
            patterns.append({
                "date": n["_date"],
                "pattern": "histamine_likely",
                "detail": f"GI {gi} + nasal {nasal} together — histamine overload pattern (ABP1 3x het)",
            })

    # High anxiety + no exercise
    for n in notes:
        anx = n.get("symptoms", {}).get("anxiety")
        ex = n.get("interventions", {}).get("exercise")
        if anx is not None and anx >= 6 and ex is False:
            patterns.append({
                "date": n["_date"],
                "pattern": "anxiety_no_exercise",
                "detail": f"Anxiety {anx} with no exercise — DRD2 dopamine deficit unaddressed",
            })

    # Morning stiffness > 5
    for n in notes:
        ms = n.get("symptoms", {}).get("morning_stiffness")
        if ms is not None and ms >= 5:
            patterns.append({
                "date": n["_date"],
                "pattern": "inflammatory_stiffness",
                "detail": f"Morning stiffness {ms}/10 — HLA-B27 flare indicator, track duration in notes",
            })

    return {
        "days": total_days,
        "date_range": date_range,
        "adherence": adherence,
        "symptoms": symptom_stats,
        "interventions": intervention_freq,
        "correlations": correlations,
        "exercise_effect": exercise_corr,
        "patterns": patterns,
    }


def format_report(analysis: dict) -> str:
    if "error" in analysis:
        return f"  {analysis['error']}"

    lines = [
        f"  Health Analysis — {analysis['date_range']} ({analysis['days']} days)",
        f"  {'=' * 50}",
        "",
    ]

    # Adherence
    lines.append("  SUPPLEMENT ADHERENCE:")
    for s, data in sorted(analysis["adherence"].items(), key=lambda x: x[1]["pct"]):
        bar = "█" * (data["pct"] // 5) + "░" * (20 - data["pct"] // 5)
        flag = " ⚠" if data["pct"] < 80 else ""
        lines.append(f"    {s:20s} {bar} {data['pct']:3d}% ({data['taken']}/{data['total']}){flag}")
    lines.append("")

    # Symptoms
    lines.append("  SYMPTOM SUMMARY:")
    for s, data in sorted(analysis["symptoms"].items(), key=lambda x: -x[1]["avg"]):
        trend_icon = {"improving": "↓", "worsening": "↑", "stable": "→", "insufficient_data": "?"}
        icon = trend_icon.get(data["trend"], "?")
        lines.append(f"    {s:20s} avg {data['avg']:4.1f}  range {data['min']}-{data['max']}  {icon} {data['trend']}")
    lines.append("")

    # Interventions
    lines.append("  INTERVENTIONS:")
    for i, data in sorted(analysis["interventions"].items(), key=lambda x: -x[1]["pct"]):
        lines.append(f"    {i:20s} {data['done']}/{data['total']} days ({data['pct']}%)")
    lines.append("")

    # Correlations
    if analysis["correlations"]:
        lines.append("  CORRELATIONS (supplement → next-day symptom):")
        for c in analysis["correlations"][:5]:
            direction = "↓ better" if c["direction"] == "better" else "↑ worse"
            lines.append(f"    {c['supplement']:15s} → {c['symptom']:20s} {direction} by {abs(c['diff']):.1f} pts "
                        f"(with: {c['avg_with']:.1f}, without: {c['avg_without']:.1f}, n={c['n_with']}+{c['n_without']})")
        lines.append("")

    # Exercise effect
    if analysis["exercise_effect"]:
        lines.append("  EXERCISE EFFECT (next-day symptoms):")
        for e in analysis["exercise_effect"]:
            direction = "↓ better" if e["diff"] > 0 else "↑ worse"
            lines.append(f"    {e['symptom']:20s} {direction} by {abs(e['diff']):.1f} pts "
                        f"(after exercise: {e['avg_after_exercise']:.1f}, no exercise: {e['avg_no_exercise']:.1f})")
        lines.append("")

    # Patterns
    if analysis["patterns"]:
        lines.append("  FLAGGED PATTERNS:")
        pattern_counts = defaultdict(int)
        for p in analysis["patterns"]:
            pattern_counts[p["pattern"]] += 1
        for pattern, count in sorted(pattern_counts.items(), key=lambda x: -x[1]):
            example = next(p for p in analysis["patterns"] if p["pattern"] == pattern)
            lines.append(f"    {pattern:25s} {count}x — {example['detail']}")
        lines.append("")

    return "\n".join(lines)


def save_report(analysis: dict, vault: Path) -> Path:
    today = date.today().isoformat()
    report = format_report(analysis)

    content = f"""---
type: research
created_date: '{today}'
tags: [health-data, analysis, automated]
---

# Health Analysis — {analysis.get('date_range', today)}

```
{report}
```

## Raw Data

```json
{json.dumps(analysis, indent=2, default=str)}
```
"""
    out = vault / "Research" / f"{today.replace('-', '')}-health-analysis.md"
    out.write_text(content, encoding="utf-8")
    return out


def main():
    global VAULT_ROOT
    parser = argparse.ArgumentParser(description="Analyze daily health logs")
    parser.add_argument("--days", "-d", type=int, default=14, help="Days to analyze")
    parser.add_argument("--json", "-j", action="store_true", help="JSON output")
    parser.add_argument("--save", "-s", action="store_true", help="Save to vault")
    args = parser.parse_args()

    VAULT_ROOT = _resolve_vault()
    notes = load_daily_notes(VAULT_ROOT, args.days)
    analysis = analyze(notes)

    if args.json:
        print(json.dumps(analysis, indent=2, default=str))
    else:
        print(format_report(analysis))

    if args.save and "error" not in analysis:
        path = save_report(analysis, VAULT_ROOT)
        print(f"  Saved → {path.relative_to(VAULT_ROOT)}")


if __name__ == "__main__":
    main()
