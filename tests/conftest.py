"""Shared test fixtures for genome-toolkit."""
import os
import sys
from pathlib import Path

# WeasyPrint needs Homebrew's GLib/Pango libs on macOS (not in conda's search path).
# DYLD_FALLBACK_LIBRARY_PATH is respected by the dynamic linker and not stripped by SIP.
if sys.platform == "darwin":
    _homebrew_lib = "/opt/homebrew/lib"
    _existing = os.environ.get("DYLD_FALLBACK_LIBRARY_PATH", "")
    if _homebrew_lib not in _existing:
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = (
            f"{_homebrew_lib}:{_existing}" if _existing else _homebrew_lib
        )

import pytest

# Add scripts/ to path so we can import lib modules
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def fixtures_dir():
    return FIXTURES_DIR


@pytest.fixture
def sample_23andme():
    return FIXTURES_DIR / "23andme_v4_sample.txt"


@pytest.fixture
def sample_ancestry():
    return FIXTURES_DIR / "ancestry_sample.txt"


@pytest.fixture
def sample_myheritage():
    return FIXTURES_DIR / "myheritage_sample.csv"


@pytest.fixture
def sample_vcf():
    return FIXTURES_DIR / "generic_sample.vcf"


@pytest.fixture
def vault_notes_dir():
    return FIXTURES_DIR / "vault_notes"


@pytest.fixture
def tmp_db(tmp_path):
    """Temporary SQLite database path."""
    return tmp_path / "test_genome.db"


@pytest.fixture
def migrations_dir():
    return REPO_ROOT / "scripts" / "data" / "migrations"
