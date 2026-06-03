"""Tests for prepare_for_imputation.py — reference-anchored imputation prep.

The legacy exporter invented REF/ALT from the observed sample genotype, which
silently corrupts homozygous-alternate calls (observed AA at reference G was
written as REF=A ALT=. GT=0/0 instead of REF=G ALT=A GT=1/1). That exporter is
removed; REF/ALT now come from a reference FASTA via `bcftools convert --tsv2vcf`.
"""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import prepare_for_imputation as pfi


class TestUnsafeEncoderRemoved:
    """The corruption-prone encoder must not exist anymore (hard-disabled)."""

    def test_genotype_to_vcf_fields_removed(self):
        assert not hasattr(pfi, "genotype_to_vcf_fields")

    def test_write_vcf_removed(self):
        assert not hasattr(pfi, "write_vcf")


class TestIsPalindromic:
    def test_at_pair_is_palindromic(self):
        assert pfi.is_palindromic("A", "T")
        assert pfi.is_palindromic("T", "A")

    def test_cg_pair_is_palindromic(self):
        assert pfi.is_palindromic("C", "G")
        assert pfi.is_palindromic("G", "C")

    def test_non_palindromic_pairs(self):
        assert not pfi.is_palindromic("A", "G")
        assert not pfi.is_palindromic("A", "C")
        assert not pfi.is_palindromic("C", "T")
        assert not pfi.is_palindromic("G", "T")

    def test_het_palindromic_genotype(self):
        assert pfi.het_palindromic_genotype("AT")
        assert pfi.het_palindromic_genotype("CG")
        assert not pfi.het_palindromic_genotype("AG")
        # Homozygous calls reveal only one allele — not detectable as palindromic
        assert not pfi.het_palindromic_genotype("AA")


class TestDedupeVariants:
    def test_drops_duplicate_rsid(self):
        variants = [
            ("1", 100, "rs1", "AG"),
            ("1", 100, "rs1", "AG"),
            ("2", 200, "rs2", "CC"),
        ]
        deduped, dropped = pfi.dedupe_variants(variants)
        assert [v[2] for v in deduped] == ["rs1", "rs2"]
        assert dropped == 1

    def test_drops_duplicate_position_different_rsid(self):
        variants = [
            ("1", 100, "rs1", "AG"),
            ("1", 100, "rs9", "AG"),  # same locus, different id
        ]
        deduped, dropped = pfi.dedupe_variants(variants)
        assert len(deduped) == 1
        assert dropped == 1


class TestWriteTsv:
    def test_writes_sorted_bcftools_columns(self, tmp_path):
        variants = [
            ("2", 500, "rs2", "AG"),
            ("1", 200, "rs1b", "CC"),
            ("1", 100, "rs1a", "TT"),
        ]
        out = tmp_path / "geno.tsv"
        written = pfi.write_tsv(variants, str(out))

        assert written == 3
        rows = [r.split("\t") for r in out.read_text().strip().split("\n")]
        # Column order must match `-c ID,CHROM,POS,AA`
        assert rows[0] == ["rs1a", "1", "100", "TT"]
        assert rows[1] == ["rs1b", "1", "200", "CC"]
        assert rows[2] == ["rs2", "2", "500", "AG"]


class TestBuildCommand:
    def test_tsv2vcf_command_uses_reference_and_columns(self):
        cmd = pfi.build_tsv2vcf_command("geno.tsv", "ref.fa", sample="ME")
        assert "--tsv2vcf" in cmd
        assert "geno.tsv" in cmd
        # REF source is the FASTA, never the sample
        assert "-f" in cmd and "ref.fa" in cmd
        ci = cmd.index("-c")
        assert cmd[ci + 1] == "ID,CHROM,POS,AA"
        si = cmd.index("-s")
        assert cmd[si + 1] == "ME"


class TestPrepareVcfErrors:
    def test_missing_reference_raises(self, tmp_path):
        tsv = tmp_path / "geno.tsv"
        tsv.write_text("rs1\t1\t100\tAA\n")
        with pytest.raises(RuntimeError, match="[Rr]eference"):
            pfi.prepare_vcf(str(tsv), str(tmp_path / "nope.fa"), str(tmp_path / "out.vcf"))


def _has_bcftools():
    return shutil.which("bcftools") is not None


@pytest.mark.skipif(not _has_bcftools(), reason="bcftools not installed")
class TestPrepareVcfIntegration:
    """End-to-end against real bcftools: proves the corruption is fixed."""

    def _mini_reference(self, tmp_path):
        # contig "1": ref G@100, A@150, C@50
        seq = ["N"] * 200
        seq[99] = "G"
        seq[149] = "A"
        seq[49] = "C"
        fa = tmp_path / "ref.fa"
        fa.write_text(">1\n" + "".join(seq) + "\n")
        return fa

    def _read_records(self, vcf_path):
        out = subprocess.run(
            ["bcftools", "view", "-H", str(vcf_path)],
            capture_output=True, text=True, check=True,
        ).stdout
        records = {}
        for line in out.strip().split("\n"):
            if not line:
                continue
            f = line.split("\t")
            records[f[2]] = {"ref": f[3], "alt": f[4], "gt": f[9]}
        return records

    def test_homozygous_alt_is_not_corrupted(self, tmp_path):
        fa = self._mini_reference(tmp_path)
        tsv = tmp_path / "geno.tsv"
        # observed AA at a locus whose reference allele is G
        pfi.write_tsv([("1", 100, "rs_homalt", "AA")], str(tsv))
        out = tmp_path / "out.vcf"
        pfi.prepare_vcf(str(tsv), str(fa), str(out))

        rec = self._read_records(out)["rs_homalt"]
        # The whole point: NOT REF=A ALT=. GT=0/0
        assert rec == {"ref": "G", "alt": "A", "gt": "1/1"}

    def test_heterozygous_anchored_to_reference(self, tmp_path):
        fa = self._mini_reference(tmp_path)
        tsv = tmp_path / "geno.tsv"
        pfi.write_tsv([("1", 150, "rs_het", "AG")], str(tsv))
        out = tmp_path / "out.vcf"
        pfi.prepare_vcf(str(tsv), str(fa), str(out))

        rec = self._read_records(out)["rs_het"]
        assert rec == {"ref": "A", "alt": "G", "gt": "0/1"}

    def test_palindromic_sites_dropped_by_default(self, tmp_path):
        fa = self._mini_reference(tmp_path)
        tsv = tmp_path / "geno.tsv"
        # AT at ref A -> palindromic A/T, must be excluded
        pfi.write_tsv(
            [("1", 150, "rs_palin", "AT"), ("1", 100, "rs_keep", "AA")],
            str(tsv),
        )
        out = tmp_path / "out.vcf"
        pfi.prepare_vcf(str(tsv), str(fa), str(out))

        recs = self._read_records(out)
        assert "rs_palin" not in recs
        assert "rs_keep" in recs

    def test_palindromic_kept_when_disabled(self, tmp_path):
        fa = self._mini_reference(tmp_path)
        tsv = tmp_path / "geno.tsv"
        pfi.write_tsv([("1", 150, "rs_palin", "AT")], str(tsv))
        out = tmp_path / "out.vcf"
        pfi.prepare_vcf(str(tsv), str(fa), str(out), drop_palindromic=False)

        assert "rs_palin" in self._read_records(out)


import sqlite3


def _make_profile_db(path, with_profile_column):
    conn = sqlite3.connect(str(path))
    if with_profile_column:
        conn.execute(
            "CREATE TABLE snps (rsid TEXT, profile_id TEXT DEFAULT 'default', "
            "chromosome TEXT, position INTEGER, genotype TEXT, source TEXT, "
            "PRIMARY KEY (rsid, profile_id))"
        )
        rows = [
            ("rs100", "default", "1", 100, "AG", "genotyped"),
            ("rs200", "default", "1", 200, "CT", "genotyped"),
            ("rs300", "alice", "1", 300, "GG", "genotyped"),
            # shared rsid, different profile + genotype
            ("rs100", "alice", "1", 100, "AA", "genotyped"),
        ]
        conn.executemany(
            "INSERT INTO snps (rsid, profile_id, chromosome, position, genotype, source) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            rows,
        )
    else:
        conn.execute(
            "CREATE TABLE snps (rsid TEXT PRIMARY KEY, chromosome TEXT, "
            "position INTEGER, genotype TEXT, source TEXT)"
        )
        conn.executemany(
            "INSERT INTO snps (rsid, chromosome, position, genotype, source) "
            "VALUES (?, ?, ?, ?, ?)",
            [
                ("rs100", "1", 100, "AG", "genotyped"),
                ("rs200", "1", 200, "CT", "genotyped"),
            ],
        )
    conn.commit()
    conn.close()


class TestProfileScopedQuery:
    """query_genotyped_snps must filter by profile_id when the column exists."""

    def test_filters_to_requested_profile(self, tmp_path):
        db = tmp_path / "multi.db"
        _make_profile_db(db, with_profile_column=True)

        variants, _stats = pfi.query_genotyped_snps(db, profile_id="default")
        by_rsid = {rsid: gt for (_c, _p, rsid, gt) in variants}
        assert set(by_rsid) == {"rs100", "rs200"}
        assert by_rsid["rs100"] == "AG"  # default genotype, not alice's AA

        alice_variants, _ = pfi.query_genotyped_snps(db, profile_id="alice")
        alice_by_rsid = {rsid: gt for (_c, _p, rsid, gt) in alice_variants}
        assert set(alice_by_rsid) == {"rs100", "rs300"}
        assert alice_by_rsid["rs100"] == "AA"

    def test_columnless_db_still_works_with_default(self, tmp_path):
        db = tmp_path / "single.db"
        _make_profile_db(db, with_profile_column=False)

        variants, _stats = pfi.query_genotyped_snps(db, profile_id="default")
        assert {rsid for (_c, _p, rsid, _gt) in variants} == {"rs100", "rs200"}
