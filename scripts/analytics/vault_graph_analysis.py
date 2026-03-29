#!/usr/bin/env python3
"""
Vault Graph Analysis — PageRank, centrality, orphans, clusters.

Scans all .md files in the Obsidian vault, extracts [[wikilinks]],
builds a directed graph, and computes:
  - In-degree / Out-degree
  - PageRank (iterative)
  - Betweenness centrality (bridge nodes)
  - Connected-component clusters
  - Orphan notes (in-degree = 0)

Output: data/output/vault_graph_report.txt

Usage:
    python3 data/scripts/vault_graph_analysis.py
"""

import os
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT, OUTPUT_DIR

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
EXCLUDE_DIRS = {"Templates", "data", ".obsidian", ".trash", ".claude"}
OUTPUT_FILE = OUTPUT_DIR / "vault_graph_report.txt"

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?((?:\|[^\]]*)?)\]\]")

DAMPING = 0.85
PAGERANK_ITERATIONS = 100
PAGERANK_TOL = 1e-8


# ---------------------------------------------------------------------------
# 1. Collect notes
# ---------------------------------------------------------------------------
def collect_notes(vault: Path) -> dict[str, Path]:
    """Return {note_name: path} for every .md file not in excluded dirs."""
    notes = {}
    for md in vault.rglob("*.md"):
        rel = md.relative_to(vault)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        name = md.stem  # note name without .md
        notes[name] = md
    return notes


# ---------------------------------------------------------------------------
# 2. Extract links
# ---------------------------------------------------------------------------
def extract_links(filepath: Path) -> list[str]:
    """Return list of link targets from a single file."""
    try:
        text = filepath.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    targets = []
    for m in WIKILINK_RE.finditer(text):
        target = m.group(1).strip()
        if target:
            targets.append(target)
    return targets


# ---------------------------------------------------------------------------
# 3. Build graph
# ---------------------------------------------------------------------------
def build_graph(notes: dict[str, Path]):
    """
    Returns:
        adjacency  – {source: [target, …]}  (directed, targets may not exist as files)
        all_nodes  – set of every node mentioned (file-based + link-only)
    """
    adjacency: dict[str, list[str]] = defaultdict(list)
    all_nodes = set(notes.keys())

    for name, path in notes.items():
        for target in extract_links(path):
            adjacency[name].append(target)
            all_nodes.add(target)

    return adjacency, all_nodes


# ---------------------------------------------------------------------------
# 4. Degree counts
# ---------------------------------------------------------------------------
def degree_counts(adjacency, all_nodes):
    in_deg = defaultdict(int)
    out_deg = defaultdict(int)
    for src, targets in adjacency.items():
        out_deg[src] = len(targets)
        for t in targets:
            in_deg[t] += 1
    return in_deg, out_deg


# ---------------------------------------------------------------------------
# 5. PageRank (iterative, standard library only)
# ---------------------------------------------------------------------------
def pagerank(adjacency, all_nodes, damping=DAMPING, iterations=PAGERANK_ITERATIONS, tol=PAGERANK_TOL):
    nodes = sorted(all_nodes)
    n = len(nodes)
    idx = {nd: i for i, nd in enumerate(nodes)}
    pr = [1.0 / n] * n

    # Build reverse adjacency for faster iteration
    reverse: dict[int, list[int]] = defaultdict(list)
    out_count = [0] * n
    for src, targets in adjacency.items():
        si = idx[src]
        out_count[si] = len(targets)
        for t in targets:
            if t in idx:
                reverse[idx[t]].append(si)

    dangling = [i for i in range(n) if out_count[i] == 0]

    for _ in range(iterations):
        dangling_sum = sum(pr[i] for i in dangling)
        new_pr = [0.0] * n
        for i in range(n):
            rank = 0.0
            for j in reverse.get(i, []):
                rank += pr[j] / out_count[j]
            new_pr[i] = (1 - damping) / n + damping * (rank + dangling_sum / n)
        # Check convergence
        diff = sum(abs(new_pr[i] - pr[i]) for i in range(n))
        pr = new_pr
        if diff < tol:
            break

    return {nodes[i]: pr[i] for i in range(n)}


# ---------------------------------------------------------------------------
# 6. Betweenness centrality (Brandes algorithm, unweighted directed)
# ---------------------------------------------------------------------------
def betweenness_centrality(adjacency, all_nodes):
    """Brandes' algorithm for betweenness centrality on a directed unweighted graph."""
    nodes = sorted(all_nodes)
    bc = {n: 0.0 for n in nodes}

    # Build adjacency set for fast lookup
    adj_set: dict[str, list[str]] = defaultdict(list)
    for src, targets in adjacency.items():
        for t in targets:
            if t in all_nodes:
                adj_set[src].append(t)

    for s in nodes:
        # BFS
        stack = []
        pred: dict[str, list[str]] = {n: [] for n in nodes}
        sigma = {n: 0.0 for n in nodes}
        sigma[s] = 1.0
        dist = {n: -1 for n in nodes}
        dist[s] = 0
        queue = [s]
        qi = 0

        while qi < len(queue):
            v = queue[qi]
            qi += 1
            stack.append(v)
            for w in adj_set.get(v, []):
                if dist[w] < 0:
                    dist[w] = dist[v] + 1
                    queue.append(w)
                if dist[w] == dist[v] + 1:
                    sigma[w] += sigma[v]
                    pred[w].append(v)

        delta = {n: 0.0 for n in nodes}
        while stack:
            w = stack.pop()
            for v in pred[w]:
                delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w])
            if w != s:
                bc[w] += delta[w]

    # Normalize
    n = len(nodes)
    if n > 2:
        norm = 1.0 / ((n - 1) * (n - 2))
        bc = {k: v * norm for k, v in bc.items()}

    return bc


# ---------------------------------------------------------------------------
# 7. Connected components (undirected view)
# ---------------------------------------------------------------------------
def connected_components(adjacency, all_nodes):
    """Find connected components treating the graph as undirected."""
    undirected: dict[str, set[str]] = defaultdict(set)
    for src, targets in adjacency.items():
        for t in targets:
            if t in all_nodes:
                undirected[src].add(t)
                undirected[t].add(src)

    visited = set()
    components = []

    for node in sorted(all_nodes):
        if node in visited:
            continue
        comp = set()
        queue = [node]
        while queue:
            n = queue.pop()
            if n in visited:
                continue
            visited.add(n)
            comp.add(n)
            for nb in undirected.get(n, []):
                if nb not in visited:
                    queue.append(nb)
        components.append(comp)

    return sorted(components, key=len, reverse=True)


# ---------------------------------------------------------------------------
# 8. Report generation
# ---------------------------------------------------------------------------
def generate_report(notes, adjacency, all_nodes, in_deg, out_deg, pr, bc, components):
    lines = []
    lines.append("=" * 72)
    lines.append("VAULT GRAPH ANALYSIS REPORT")
    lines.append("=" * 72)
    lines.append("")

    file_notes = set(notes.keys())
    link_only = all_nodes - file_notes

    lines.append(f"Total .md files scanned:   {len(file_notes)}")
    lines.append(f"Total unique nodes:        {len(all_nodes)}")
    lines.append(f"Link-only (no file):       {len(link_only)}")
    total_edges = sum(len(v) for v in adjacency.values())
    lines.append(f"Total directed edges:      {total_edges}")
    lines.append(f"Connected components:      {len(components)}")
    lines.append("")

    # --- Top 20 by PageRank ---
    lines.append("-" * 72)
    lines.append("TOP 20 MOST CENTRAL NOTES (by PageRank)")
    lines.append("-" * 72)
    lines.append(f"{'Rank':<5} {'Note':<45} {'PR':>8} {'In':>4} {'Out':>4}")
    top_pr = sorted(pr.items(), key=lambda x: x[1], reverse=True)[:20]
    for i, (name, score) in enumerate(top_pr, 1):
        marker = "" if name in file_notes else " [NO FILE]"
        lines.append(f"{i:<5} {(name + marker):<45} {score:.5f} {in_deg.get(name,0):>4} {out_deg.get(name,0):>4}")
    lines.append("")

    # --- Top 20 by in-degree ---
    lines.append("-" * 72)
    lines.append("TOP 20 MOST LINKED-TO NOTES (by in-degree)")
    lines.append("-" * 72)
    lines.append(f"{'Rank':<5} {'Note':<45} {'In':>4} {'Out':>4}")
    top_in = sorted(in_deg.items(), key=lambda x: x[1], reverse=True)[:20]
    for i, (name, deg) in enumerate(top_in, 1):
        marker = "" if name in file_notes else " [NO FILE]"
        lines.append(f"{i:<5} {(name + marker):<45} {deg:>4} {out_deg.get(name,0):>4}")
    lines.append("")

    # --- Orphan notes (in-degree 0, file exists) ---
    lines.append("-" * 72)
    lines.append("ORPHAN NOTES (in-degree = 0, file exists)")
    lines.append("-" * 72)
    orphans = sorted(n for n in file_notes if in_deg.get(n, 0) == 0)
    if orphans:
        for name in orphans:
            rel = notes[name].relative_to(VAULT_ROOT)
            lines.append(f"  {name:<40} ({rel})")
    else:
        lines.append("  (none)")
    lines.append(f"\nTotal orphans: {len(orphans)}")
    lines.append("")

    # --- Broken links (linked but no file) ---
    lines.append("-" * 72)
    lines.append("BROKEN LINKS (referenced but no .md file)")
    lines.append("-" * 72)
    broken = sorted(link_only)
    for name in broken:
        lines.append(f"  {name:<45} (linked {in_deg.get(name,0)}x)")
    lines.append(f"\nTotal broken links: {len(broken)}")
    lines.append("")

    # --- Top 10 bridge notes ---
    lines.append("-" * 72)
    lines.append("TOP 10 BRIDGE NOTES (by betweenness centrality)")
    lines.append("-" * 72)
    lines.append(f"{'Rank':<5} {'Note':<45} {'Betweenness':>11}")
    top_bc = sorted(bc.items(), key=lambda x: x[1], reverse=True)[:10]
    for i, (name, score) in enumerate(top_bc, 1):
        marker = "" if name in file_notes else " [NO FILE]"
        lines.append(f"{i:<5} {(name + marker):<45} {score:.6f}")
    lines.append("")

    # --- Cluster summary ---
    lines.append("-" * 72)
    lines.append("CLUSTER SUMMARY (connected components, undirected)")
    lines.append("-" * 72)
    for i, comp in enumerate(components[:15], 1):
        members = sorted(comp)
        preview = ", ".join(members[:8])
        if len(members) > 8:
            preview += f", ... (+{len(members)-8} more)"
        lines.append(f"\nCluster {i} ({len(comp)} nodes):")
        lines.append(f"  {preview}")
    if len(components) > 15:
        lines.append(f"\n... and {len(components) - 15} more small clusters")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("Scanning vault...", flush=True)
    notes = collect_notes(VAULT_ROOT)
    print(f"  Found {len(notes)} notes")

    print("Extracting links...", flush=True)
    adjacency, all_nodes = build_graph(notes)
    total_edges = sum(len(v) for v in adjacency.values())
    print(f"  {len(all_nodes)} nodes, {total_edges} edges")

    print("Computing degrees...", flush=True)
    in_deg, out_deg = degree_counts(adjacency, all_nodes)

    print("Computing PageRank...", flush=True)
    pr = pagerank(adjacency, all_nodes)

    print("Computing betweenness centrality...", flush=True)
    bc = betweenness_centrality(adjacency, all_nodes)

    print("Detecting clusters...", flush=True)
    components = connected_components(adjacency, all_nodes)

    report = generate_report(notes, adjacency, all_nodes, in_deg, out_deg, pr, bc, components)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(report, encoding="utf-8")
    print(f"\nReport saved to {OUTPUT_FILE}")
    print("\n" + report)


if __name__ == "__main__":
    main()
