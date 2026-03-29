"""Tests for config-driven provider detection (Task 4)."""
import pytest
from pathlib import Path

from lib.providers.base import detect_provider, read_header_lines


FIXTURES = Path(__file__).resolve().parent / "fixtures"


class TestConfigDrivenDetection:
    """Provider detection should be driven by provider_formats.yaml."""

    def test_detection_order_from_config(self):
        """Detection should check providers in the order specified by config."""
        import yaml
        config_path = Path(__file__).resolve().parent.parent / "config" / "provider_formats.yaml"
        with open(config_path) as f:
            config = yaml.safe_load(f)

        assert "detection_order" in config
        order = config["detection_order"]
        assert order[0] == "23andme"  # most specific first
        assert order[-1] == "vcf"     # generic fallback last

    def test_provider_config_has_all_required_fields(self):
        """Each provider in config should have detection and assembly info."""
        import yaml
        config_path = Path(__file__).resolve().parent.parent / "config" / "provider_formats.yaml"
        with open(config_path) as f:
            config = yaml.safe_load(f)

        for name, provider in config["providers"].items():
            assert "name" in provider, f"{name} missing 'name'"
            assert "detection" in provider, f"{name} missing 'detection'"
            assert "assembly" in provider, f"{name} missing 'assembly'"

    def test_detection_still_works_for_all_providers(self):
        """Regression: all fixtures should still detect correctly after refactor."""
        tests = [
            ("23andme_v4_sample.txt", "23andme"),
            ("ancestry_sample.txt", "ancestry"),
            ("myheritage_sample.csv", "myheritage"),
            ("generic_sample.vcf", "vcf"),
        ]
        for filename, expected_provider in tests:
            filepath = FIXTURES / filename
            provider_cls, confidence = detect_provider(filepath)
            provider = provider_cls()
            header = read_header_lines(filepath)
            meta = provider.metadata(filepath, header)
            assert meta.provider == expected_provider, \
                f"{filename}: expected {expected_provider}, got {meta.provider}"
