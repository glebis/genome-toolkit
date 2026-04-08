# GWAS hits — derived data

This directory holds pre-computed top hits extracted from the Psychiatric
Genomics Consortium (PGC) GWAS summary statistics, filtered to
genome-wide significance (p < 5×10⁻⁸) for use by the mental-health panel.

## How to regenerate

```bash
pip install "genome-toolkit[gwas]"
python scripts/ingest_pgc_gwas.py anxiety
```

This downloads the relevant PGC dataset from
[OpenMed on HuggingFace](https://huggingface.co/OpenMed), filters rows
where p-value < threshold, and writes a compact `{trait}-hits.json`.

## Files

- `{trait}-hits.json` — list of significant SNPs with effect allele,
  direction, p-value, and metadata. Designed to be small enough to
  commit and joinable at runtime against `genome.db`.

## License & citation

Source data is PGC, hosted under CC BY 4.0 by the OpenMed project.
Always cite the original publication when using a trait's hits —
citation is included in each `{trait}-hits.json`.
