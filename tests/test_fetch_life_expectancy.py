import json
from pathlib import Path

from scripts.fetch_life_expectancy import parse_eurostat, parse_who, build_life_tables

FIX = Path(__file__).parent / "fixtures"


def _eurostat():
    return json.loads((FIX / "eurostat_demo_mlexpec.json").read_text())


def _who():
    return json.loads((FIX / "who_ru_lifetable.json").read_text())


def test_parse_eurostat_extracts_ex_by_age():
    out = parse_eurostat(_eurostat())
    assert out["DE"]["name"] == "Germany"
    assert out["DE"]["source"].startswith("Eurostat")
    # JSON-stat linear index decode: DE male age 38 -> value index 0 = 41.1
    assert out["DE"]["ex_by_age"]["male"]["38"] == 41.1
    # NL female age 40 -> index 7 = 45.0
    assert out["NL"]["ex_by_age"]["female"]["40"] == 45.0


def test_parse_who_russia_brackets():
    out = parse_who(_who())
    assert "RU" in out
    assert out["RU"]["name"] == "Russia"
    assert out["RU"]["source"].startswith("WHO")
    # at-birth male bracket rounded to 1 decimal
    assert out["RU"]["ex_by_age"]["male"]["0"] == 65.6
    assert out["RU"]["ex_by_age"]["female"]["60"] == 19.0


def test_build_life_tables_has_retrieved_and_sources():
    tables = build_life_tables(parse_eurostat(_eurostat()), parse_who(_who()), retrieved="2026-05-30")
    assert tables["retrieved"] == "2026-05-30"
    assert tables["countries"]["DE"]["source"].startswith("Eurostat")
    assert tables["countries"]["RU"]["source"].startswith("WHO")
    # both sexes present for an EU country
    assert set(tables["countries"]["DE"]["ex_by_age"].keys()) == {"male", "female"}
