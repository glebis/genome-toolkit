#!/usr/bin/env python3
"""Reproducible life-expectancy fetcher for the Migrant Life-Map (#27).

Sources:
  - Eurostat ``demo_mlexpec`` (life expectancy by age x sex x geo) — all EU, via
    the JSON-stat 2.0 dissemination REST API. Single-year ages = exact anchors.
  - WHO GHO (life expectancy at birth + at age 60) for Russia, via OData. Sparse
    brackets — the frontend maps to the nearest bracket honestly.

Pure parsers (``parse_eurostat``, ``parse_who``, ``build_life_tables``) are unit
tested against recorded fixtures; the ``fetch_*`` functions hit the network and
are only exercised by ``python scripts/fetch_life_expectancy.py``, which writes
``backend/app/data/life_tables.json`` (committed, version-stamped).
"""
from __future__ import annotations

import json
from datetime import date, timezone, datetime
from pathlib import Path
from typing import Any

# Country-of-interest set: broad EU (Eurostat) + Russia (WHO).
EUROSTAT_GEOS = [
    "BE", "BG", "CZ", "DK", "DE", "EE", "IE", "EL", "ES", "FR", "HR", "IT", "CY",
    "LV", "LT", "LU", "HU", "MT", "NL", "AT", "PL", "PT", "RO", "SI", "SK", "FI",
    "SE", "IS", "NO", "CH",
]
# Single-year ages we pull (working-age through elderly).
EUROSTAT_AGES = list(range(18, 91))
WHO_BRACKETS = {0: "WHOSIS_000001", 60: "WHOSIS_000015"}  # bracket age -> indicator

_SEX_EUROSTAT = {"M": "male", "F": "female"}
_SEX_WHO = {"SEX_MLE": "male", "SEX_FMLE": "female"}

# Committed reference data lives in config/ alongside risk-landscape.yaml etc.
# (backend/app/data/ is gitignored for runtime DBs).
DATA_FILE = Path(__file__).resolve().parents[1] / "config" / "life_tables.json"


def _round1(x: float) -> float:
    return round(float(x), 1)


def parse_eurostat(raw: dict[str, Any]) -> dict[str, dict]:
    """Decode a JSON-stat 2.0 ``demo_mlexpec`` response into
    ``{CC: {name, source, ex_by_age: {male/female: {age_str: ex}}}}``.
    """
    dim_ids: list[str] = raw["id"]
    sizes: list[int] = raw["size"]
    dims = raw["dimension"]

    # Row-major strides: the last dimension varies fastest.
    strides = [1] * len(sizes)
    for i in range(len(sizes) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    # position -> code for each dimension we care about
    def pos_to_code(dim: str) -> dict[int, str]:
        index = dims[dim]["category"]["index"]
        return {pos: code for code, pos in index.items()}

    sex_codes = pos_to_code("sex")
    age_codes = pos_to_code("age")
    geo_codes = pos_to_code("geo")
    geo_labels = dims["geo"]["category"]["label"]

    out: dict[str, dict] = {}
    for key, value in raw["value"].items():
        if value is None:
            continue
        idx = int(key)
        coords = {}
        for d, dim in enumerate(dim_ids):
            coords[dim] = (idx // strides[d]) % sizes[d]

        sex = _SEX_EUROSTAT.get(sex_codes.get(coords["sex"], ""))
        if sex is None:
            continue
        age_code = age_codes.get(coords["age"], "")
        if not age_code.startswith("Y") or not age_code[1:].isdigit():
            continue
        age = str(int(age_code[1:]))
        geo = geo_codes.get(coords["geo"], "")
        if not geo:
            continue

        country = out.setdefault(
            geo,
            {
                "name": geo_labels.get(geo, geo),
                "source": "Eurostat demo_mlexpec",
                "ex_by_age": {"male": {}, "female": {}},
            },
        )
        country["ex_by_age"][sex][age] = _round1(value)

    return out


def parse_who(raw: dict[str, dict]) -> dict[str, dict]:
    """Decode WHO GHO OData responses keyed by bracket age into
    ``{RU: {name, source, ex_by_age: {male/female: {bracket_age_str: ex}}}}``.
    """
    ex_by_age: dict[str, dict[str, float]] = {"male": {}, "female": {}}
    for bracket_age, resp in raw.items():
        for row in resp.get("value", []):
            if row.get("SpatialDim") != "RUS":
                continue
            sex = _SEX_WHO.get(row.get("Dim1", ""))
            val = row.get("NumericValue")
            if sex is None or val is None:
                continue
            ex_by_age[sex][str(int(bracket_age))] = _round1(val)

    return {
        "RU": {
            "name": "Russia",
            "source": "WHO GHO life tables",
            "ex_by_age": ex_by_age,
        }
    }


def build_life_tables(
    eurostat: dict[str, dict], who: dict[str, dict], retrieved: str
) -> dict[str, Any]:
    """Merge per-source country dicts into the committed file shape."""
    countries: dict[str, dict] = {}
    countries.update(eurostat)
    countries.update(who)
    return {"retrieved": retrieved, "countries": countries}


# ---------------------------------------------------------------------------
# Live fetch (network) — only run via __main__, never in tests.
# ---------------------------------------------------------------------------

def fetch_eurostat() -> dict[str, dict]:  # pragma: no cover - network
    import httpx

    base = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_mlexpec"
    params = [("format", "JSON"), ("lang", "EN"), ("sex", "M"), ("sex", "F")]
    for g in EUROSTAT_GEOS:
        params.append(("geo", g))
    for a in EUROSTAT_AGES:
        params.append(("age", f"Y{a}"))
    merged: dict[str, dict] = {}
    # Latest year first; Eurostat returns the most recent available per series.
    for year in ("2023", "2022", "2021"):
        try:
            r = httpx.get(base, params=params + [("time", year)], timeout=60)
            if r.status_code != 200:
                continue
            parsed = parse_eurostat(r.json())
            # Fill only missing entries so the newest year wins.
            for cc, c in parsed.items():
                dst = merged.setdefault(cc, c)
                for sex in ("male", "female"):
                    for age, ex in c["ex_by_age"][sex].items():
                        dst["ex_by_age"][sex].setdefault(age, ex)
        except Exception as exc:  # noqa: BLE001
            print(f"[eurostat] {year} failed: {exc}")
    return merged


def fetch_who() -> dict[str, dict]:  # pragma: no cover - network
    import httpx

    raw: dict[str, dict] = {}
    for bracket_age, indicator in WHO_BRACKETS.items():
        url = f"https://ghoapi.azureedge.net/api/{indicator}"
        flt = "SpatialDim eq 'RUS' and TimeDim eq 2021"
        r = httpx.get(url, params={"$filter": flt}, timeout=60)
        r.raise_for_status()
        raw[str(bracket_age)] = r.json()
    return parse_who(raw)


def main() -> None:  # pragma: no cover - network
    retrieved = datetime.now(timezone.utc).date().isoformat()
    eurostat = fetch_eurostat()
    who = fetch_who()
    tables = build_life_tables(eurostat, who, retrieved=retrieved)
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(tables, indent=2, ensure_ascii=False))
    print(f"Wrote {DATA_FILE} — {len(tables['countries'])} countries, retrieved {retrieved}")


if __name__ == "__main__":  # pragma: no cover
    main()
