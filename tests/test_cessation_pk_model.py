"""Tests for scripts/analytics/cessation_pk_model containment (audit finding #17).

The cannabis-cessation PK model is a toy sensitivity tool. Its numeric outputs
(fold-changes / magnitude estimates) leaked into prescriber-facing report prose
as hard clinical claims ("tripling sertraline levels", "equivalent to 100-200 mg").

These tests pin down the *containment* contract: every fold-change the module
surfaces must carry an explicit not-clinical-grade caveat, and any human-readable
rendering of a magnitude must include that caveat alongside the number — never a
bare "tripling"/"100-200 mg"-style claim.
"""
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from analytics import cessation_pk_model as pk  # noqa: E402


# --- (a) structured result carries the illustrative / not-clinical flag --------

def test_fold_change_result_is_self_labelling():
    """A surfaced fold-change must be wrapped with caveat metadata, not bare."""
    result = pk.illustrative_fold_change(3.0, label="sertraline exposure")
    # Not a bare number.
    assert not isinstance(result, (int, float))
    # Explicit illustrative / not-clinical-grade flags.
    assert result.is_illustrative is True
    assert result.not_clinical_grade is True
    # The numeric value is still accessible for plotting / sensitivity use.
    assert result.fold_change == pytest.approx(3.0)
    # A disclaimer string travels with it.
    assert isinstance(result.disclaimer, str)
    assert result.disclaimer.strip()
    assert "not clinical" in result.disclaimer.lower()


def test_disclaimer_is_non_empty_and_warns_against_dosing():
    result = pk.illustrative_fold_change(0.4, label="sertraline exposure")
    low = result.disclaimer.lower()
    assert "illustrative" in low
    assert "dosing" in low or "not clinical" in low


# --- (b) human-readable rendering always carries the caveat --------------------

def test_describe_includes_caveat_text():
    """format/describe output must include the not-clinical-grade caveat."""
    result = pk.illustrative_fold_change(3.0, label="sertraline exposure")
    text = result.describe()
    low = text.lower()
    assert "illustrative" in low
    assert "not clinical" in low or "not for" in low


def test_describe_does_not_present_bare_magnitude_claim():
    """A magnitude must never be rendered as a standalone clinical fact."""
    result = pk.illustrative_fold_change(3.0, label="sertraline exposure")
    text = result.describe()
    # If a magnitude word/number appears, the caveat must appear in the same string.
    low = text.lower()
    assert ("illustrative" in low) and ("not clinical" in low or "not for" in low), (
        "magnitude rendered without an attached not-clinical-grade caveat: " + text
    )


def test_module_format_helper_wraps_bare_number():
    """A bare float fed to the formatting helper comes back caveated."""
    text = pk.format_result(3.0, label="sertraline exposure")
    low = text.lower()
    assert "3" in text  # the magnitude is shown...
    assert "illustrative" in low  # ...but never naked
    assert "not clinical" in low or "not for" in low
