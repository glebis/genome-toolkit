"""Migrant Life-Map routes (#27).

Serves the committed, version-stamped life-table data produced by
``scripts/fetch_life_expectancy.py``. Dumb data server — all blend logic lives in
the frontend (``lib/lifeBlend.ts``). The modifier catalogue is served via the
existing generic ``/api/config/{name}`` endpoint (``config/life-modifiers.yaml``).
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/life-map", tags=["life-map"])

_DATA_FILE = Path(__file__).resolve().parents[3] / "config" / "life_tables.json"


@router.get("/life-tables")
async def get_life_tables() -> dict:
    """Return the committed life-table dataset (countries x sex x age -> ex)."""
    if not _DATA_FILE.exists():
        raise HTTPException(status_code=404, detail="Life tables not generated")
    try:
        return json.loads(_DATA_FILE.read_text())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to read life tables: {exc}")
