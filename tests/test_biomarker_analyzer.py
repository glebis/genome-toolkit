"""Tests for scripts/analytics/biomarker_analyzer.check_thresholds.

Covers audit finding #19: unit validation before applying screening-prompt
thresholds, and softened, non-prescriptive action wording.
"""
import sys
from pathlib import Path

import pytest

# Make scripts/ importable (mirrors how the script adds its parent to sys.path).
SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from analytics import biomarker_analyzer as ba  # noqa: E402


def test_over_threshold_with_matching_unit_triggers_softened_action():
    """A value over threshold WITH the matching unit triggers the action."""
    alerts = ba.check_thresholds("CRP", 4.0, unit="mg/L")
    assert any("4.0" in a and "3.0" in a for a in alerts), alerts
    # Softened, non-prescriptive wording — no prescriptive 'SSRI augmentation'.
    joined = " ".join(alerts).lower()
    assert "discuss" in joined
    assert "do not infer medication changes from genetics alone" in joined
    assert "ssri augmentation" not in joined


def test_same_value_mismatched_unit_does_not_trigger():
    """SAME value with a MISMATCHED unit does NOT trigger the action."""
    alerts = ba.check_thresholds("CRP", 4.0, unit="mg/dL")
    joined = " ".join(alerts).lower()
    # No threshold-crossing action emitted...
    assert "discuss elevated crp" not in joined
    # ...but an informational mismatch note is.
    assert any("does not match" in a.lower() and "mg/l" in a.lower() for a in alerts), alerts


def test_missing_unit_still_applies_threshold():
    """Missing unit is permissive: threshold still applies (no unit to reject)."""
    alerts = ba.check_thresholds("CRP", 4.0, unit="")
    joined = " ".join(alerts).lower()
    assert "discuss" in joined
    # No mismatch note when no unit was supplied.
    assert "does not match" not in joined


def test_below_threshold_matching_unit_no_alert():
    """A value below all thresholds with matching unit yields no crossing alert."""
    alerts = ba.check_thresholds("CRP", 0.5, unit="mg/L")
    assert not any("discuss" in a.lower() for a in alerts), alerts


def test_thresholds_are_dicts_with_unit_keys():
    """The THRESHOLDS table now carries explicit units per rule."""
    for rules in ba.THRESHOLDS.values():
        for rule in rules:
            assert isinstance(rule, dict)
            assert {"op", "threshold", "unit", "action"} <= set(rule)
