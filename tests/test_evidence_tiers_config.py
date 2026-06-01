"""Tests for evidence_tiers.yaml confidence labels.

Audit finding #20: the `confidence` field must not present fake-looking
numeric percentages (e.g. "85-95%"). Confidence is qualitative unless a
specific validation method computes it, so it must use qualitative labels.
"""
import re
from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "evidence_tiers.yaml"

# Allowed qualitative labels (audit-mandated mapping).
QUALITATIVE_LABELS = {
    "high",
    "moderate-high",
    "moderate",
    "low",
    "speculative",
}

# Per-tier expected qualitative confidence label.
EXPECTED = {
    "E1": "high",
    "E2": "moderate-high",
    "E3": "moderate",
    "E4": "low",
    "E5": "speculative",
}

_PERCENT_RE = re.compile(r"\d+\s*-\s*\d+\s*%|\d+\s*%")


def _load_tiers() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)["tiers"]


class TestEvidenceTierConfidence:
    def test_no_numeric_percent_confidence(self):
        """No tier may express confidence as a numeric percentage string."""
        tiers = _load_tiers()
        for tier_id, tier in tiers.items():
            conf = tier.get("confidence", "")
            assert not _PERCENT_RE.search(str(conf)), (
                f"{tier_id} confidence {conf!r} looks like a fake numeric "
                "percentage; use a qualitative label instead"
            )

    def test_confidence_is_qualitative_label(self):
        """Each tier's confidence must be an allowed qualitative label."""
        tiers = _load_tiers()
        for tier_id, tier in tiers.items():
            conf = tier.get("confidence")
            assert conf in QUALITATIVE_LABELS, (
                f"{tier_id} confidence {conf!r} is not a recognised "
                f"qualitative label {sorted(QUALITATIVE_LABELS)}"
            )

    def test_confidence_matches_audit_mapping(self):
        """Confidence labels follow the audit-mandated tier mapping."""
        tiers = _load_tiers()
        for tier_id, expected_label in EXPECTED.items():
            assert tiers[tier_id]["confidence"] == expected_label, (
                f"{tier_id} expected {expected_label!r}, "
                f"got {tiers[tier_id].get('confidence')!r}"
            )
