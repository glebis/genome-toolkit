#!/usr/bin/env python3
"""
PubMed Monitoring Script — checks for new publications relevant to vault genes.

Reads gene symbols from Genes/ directory, queries PubMed E-utilities API,
and produces a markdown report of recent publications.

Output: Research/YYYYMMDD-pubmed-monitoring-results.md

Usage:
    # Test run with 5 genes:
    python3 data/scripts/pubmed_monitor.py --limit 5

    # Full scan:
    python3 data/scripts/pubmed_monitor.py

    # Custom months lookback:
    python3 data/scripts/pubmed_monitor.py --months 3
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.config import VAULT_ROOT, GENES_DIR, RESEARCH_DIR

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
ESEARCH_URL = f"{EUTILS_BASE}/esearch.fcgi"
EFETCH_URL = f"{EUTILS_BASE}/efetch.fcgi"

USER_AGENT = "GenomeVaultMonitor/1.0 (personal genomics vault; mailto:vault@example.com)"
REQUEST_DELAY = 0.35  # ~3 requests/sec max

# Key SNPs from the vault to flag in abstracts
KEY_SNPS = [
    "rs4680", "rs1800497", "rs1800955", "rs1799971", "rs1360780",
    "rs6265", "rs140701", "rs6295", "rs738409", "rs1800562",
    "rs762551", "rs429358", "rs7412",  # APOE SNPs
    "rs1801133", "rs1801131",  # MTHFR
    "rs4244285", "rs12248560",  # CYP2C19
]


# ---------------------------------------------------------------------------
# 1. Read gene symbols
# ---------------------------------------------------------------------------
def get_gene_symbols() -> list[dict]:
    """Read gene symbols and last_reviewed dates from Genes/ frontmatter."""
    genes = []
    for md in sorted(GENES_DIR.glob("*.md")):
        symbol = md.stem
        last_reviewed = None
        try:
            text = md.read_text(encoding="utf-8", errors="replace")
            # Parse YAML frontmatter
            if text.startswith("---"):
                end = text.find("---", 3)
                if end > 0:
                    fm = text[3:end]
                    m = re.search(r'last_reviewed:\s*["\']?(\d{4}-\d{2}-\d{2})', fm)
                    if m:
                        last_reviewed = m.group(1)
        except OSError:
            pass
        genes.append({"symbol": symbol, "last_reviewed": last_reviewed, "path": md})
    return genes


# ---------------------------------------------------------------------------
# 2. PubMed API helpers
# ---------------------------------------------------------------------------
def _request(url: str, params: dict, max_retries: int = 3) -> str:
    """Make a GET request with proper User-Agent and retry logic."""
    query = urllib.parse.urlencode(params)
    full_url = f"{url}?{query}"
    req = urllib.request.Request(full_url, headers={"User-Agent": USER_AGENT})

    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt
                print(f"    Retry {attempt+1}/{max_retries} after error: {e}. Waiting {wait}s...")
                time.sleep(wait)
            else:
                raise
    return ""


def search_pubmed(gene_symbol: str, months: int = 6) -> list[str]:
    """Search PubMed for recent publications about a gene. Returns list of PMIDs."""
    from datetime import datetime, timedelta
    mindate = (datetime.now() - timedelta(days=months * 30)).strftime("%Y/%m/%d")
    maxdate = datetime.now().strftime("%Y/%m/%d")
    query = f"{gene_symbol}[Gene] AND (GWAS OR meta-analysis OR pharmacogenomics)"
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": 20,
        "retmode": "json",
        "sort": "date",
        "mindate": mindate,
        "maxdate": maxdate,
        "datetype": "pdat",
    }
    time.sleep(REQUEST_DELAY)
    try:
        text = _request(ESEARCH_URL, params)
        data = json.loads(text)
        return data.get("esearchresult", {}).get("idlist", [])
    except Exception as e:
        print(f"    Search error for {gene_symbol}: {e}")
        return []


def fetch_articles(pmids: list[str]) -> list[dict]:
    """Fetch article details for a list of PMIDs."""
    if not pmids:
        return []
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
    }
    time.sleep(REQUEST_DELAY)
    try:
        xml_text = _request(EFETCH_URL, params)
        return parse_articles_xml(xml_text)
    except Exception as e:
        print(f"    Fetch error: {e}")
        return []


def parse_articles_xml(xml_text: str) -> list[dict]:
    """Parse PubMed XML response into article dicts."""
    articles = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return articles

    for art in root.findall(".//PubmedArticle"):
        article = {}

        # PMID
        pmid_el = art.find(".//PMID")
        article["pmid"] = pmid_el.text if pmid_el is not None else "?"

        # Title
        title_el = art.find(".//ArticleTitle")
        article["title"] = title_el.text if title_el is not None else "(no title)"

        # Journal
        journal_el = art.find(".//Journal/Title")
        article["journal"] = journal_el.text if journal_el is not None else ""

        # Date
        date_parts = []
        for tag in ["Year", "Month", "Day"]:
            el = art.find(f".//PubDate/{tag}")
            if el is not None and el.text:
                date_parts.append(el.text)
        article["date"] = "-".join(date_parts) if date_parts else "?"

        # Abstract
        abstract_parts = []
        for abs_el in art.findall(".//AbstractText"):
            if abs_el.text:
                abstract_parts.append(abs_el.text)
        article["abstract"] = " ".join(abstract_parts)

        # Check for key SNPs in title + abstract
        full_text = (article.get("title", "") + " " + article.get("abstract", "")).lower()
        found_snps = [snp for snp in KEY_SNPS if snp.lower() in full_text]
        article["matched_snps"] = found_snps

        articles.append(article)

    return articles


# ---------------------------------------------------------------------------
# 3. Report generation
# ---------------------------------------------------------------------------
def generate_report(results: dict, months: int, gene_count: int) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    date_tag = datetime.now().strftime("%Y%m%d")

    lines = []
    lines.append("---")
    lines.append("type: research")
    lines.append(f"created_date: '[[{date_tag}]]'")
    lines.append("tags:")
    lines.append("  - research")
    lines.append("  - pubmed")
    lines.append("  - automated")
    gene_keys = sorted(k for k in results.keys() if not k.startswith("_meta_"))
    lines.append(f"genes: [{', '.join(gene_keys)}]")
    lines.append("systems: []")
    lines.append("actionable_findings: false")
    lines.append("---")
    lines.append("")
    lines.append("# PubMed Monitoring Results")
    lines.append("")
    lines.append(f"**Date:** {today}")
    lines.append(f"**Genes scanned:** {gene_count}")
    lines.append(f"**Lookback period:** {months} months")
    lines.append("")

    total_articles = sum(len(arts) for k, arts in results.items() if not k.startswith("_meta_"))
    genes_with_results = sum(1 for k, arts in results.items() if not k.startswith("_meta_") and arts)
    snp_flagged = sum(1 for k, arts in results.items() if not k.startswith("_meta_") for a in arts if a.get("matched_snps"))

    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Total articles found: **{total_articles}**")
    lines.append(f"- Genes with new publications: **{genes_with_results}** / {gene_count}")
    lines.append(f"- Articles mentioning vault SNPs: **{snp_flagged}**")
    lines.append("")

    # Staleness flags
    lines.append("## Staleness Flags")
    lines.append("")
    lines.append("Genes with new publications since last review:")
    lines.append("")
    stale_found = False
    for gene_symbol, articles in sorted(results.items()):
        if gene_symbol.startswith("_meta_"):
            continue
        if not articles:
            continue
        gene_info = results.get(f"_meta_{gene_symbol}", {})
        last_reviewed = gene_info.get("last_reviewed") if isinstance(gene_info, dict) else None
        if last_reviewed:
            lines.append(f"- **{gene_symbol}**: {len(articles)} new article(s) (last reviewed: {last_reviewed})")
            stale_found = True
        else:
            lines.append(f"- **{gene_symbol}**: {len(articles)} new article(s) (no last_reviewed date)")
            stale_found = True
    if not stale_found:
        lines.append("(none)")
    lines.append("")

    # Per-gene results
    lines.append("## Results by Gene")
    lines.append("")
    for gene_symbol, articles in sorted(results.items()):
        if gene_symbol.startswith("_meta_"):
            continue
        lines.append(f"### [[{gene_symbol}]]")
        lines.append("")
        if not articles:
            lines.append("No recent publications matching search criteria.")
            lines.append("")
            continue
        for art in articles:
            snp_flag = ""
            if art.get("matched_snps"):
                snp_flag = f" **SNPs: {', '.join(art['matched_snps'])}**"
            lines.append(f"- [{art['title']}](https://pubmed.ncbi.nlm.nih.gov/{art['pmid']}/) "
                         f"— *{art['journal']}* ({art['date']}){snp_flag}")
        lines.append("")

    lines.append("---")
    lines.append("*Generated by `data/scripts/pubmed_monitor.py`*")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="PubMed monitoring for vault genes")
    parser.add_argument("--limit", type=int, default=0,
                        help="Limit to N genes (0 = all). Use --limit 5 for test runs.")
    parser.add_argument("--months", type=int, default=6,
                        help="Lookback period in months (default: 6)")
    args = parser.parse_args()

    print("Reading gene symbols from vault...", flush=True)
    genes = get_gene_symbols()
    print(f"  Found {len(genes)} genes")

    if args.limit > 0:
        genes = genes[:args.limit]
        print(f"  Limited to {args.limit} genes for this run")

    results = {}
    gene_count = len(genes)

    for i, gene in enumerate(genes, 1):
        symbol = gene["symbol"]
        print(f"  [{i}/{gene_count}] Searching {symbol}...", flush=True)

        pmids = search_pubmed(symbol, args.months)
        articles = fetch_articles(pmids) if pmids else []

        results[symbol] = articles
        results[f"_meta_{symbol}"] = {"last_reviewed": gene.get("last_reviewed")}

        if pmids:
            print(f"    Found {len(pmids)} articles, fetched {len(articles)}")
        else:
            print(f"    No results")

    print("\nGenerating report...", flush=True)
    report = generate_report(results, args.months, gene_count)

    date_tag = datetime.now().strftime("%Y%m%d")
    output_path = RESEARCH_DIR / f"{date_tag}-pubmed-monitoring-results.md"
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf-8")
    print(f"Report saved to {output_path}")


if __name__ == "__main__":
    main()
