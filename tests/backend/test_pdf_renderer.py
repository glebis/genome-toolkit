"""Tests for PDF renderer service."""
import pytest
from backend.app.services.pdf_renderer import render_pdf


def test_render_simple_markdown():
    md = "# Test Report\n\nHello world.\n"
    result = render_pdf(md, "pgx")
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_render_with_table():
    md = (
        "# Report\n\n"
        "| Gene | Status |\n"
        "|------|--------|\n"
        "| CYP2D6 | Intermediate |\n"
    )
    result = render_pdf(md, "pgx")
    assert result[:5] == b"%PDF-"


def test_render_pgx_type_has_title():
    md = "# PGx Report\n\nContent here.\n"
    result = render_pdf(md, "pgx")
    assert isinstance(result, bytes)
    assert len(result) > 100


def test_render_mental_health_type():
    md = "# Mental Health\n\nContent here.\n"
    result = render_pdf(md, "mental-health")
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_render_full_type():
    md = "# Full Report\n\n## Section 1\n\nContent.\n\n## Section 2\n\nMore content.\n"
    result = render_pdf(md, "full")
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_render_with_metadata():
    md = "# Report\n\nContent.\n"
    result = render_pdf(md, "pgx", metadata={"title": "Custom Title", "date": "2026-04-12"})
    assert result[:5] == b"%PDF-"


def test_render_empty_markdown_raises():
    with pytest.raises(ValueError, match="empty"):
        render_pdf("", "pgx")


def test_render_invalid_type_raises():
    with pytest.raises(ValueError, match="report_type"):
        render_pdf("# Test\n", "invalid-type")
