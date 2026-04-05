"""Checklist API — CRUD for action items with persistence."""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app.agent import tools as _tools

router = APIRouter(prefix="/api/actions")


def _get_db():
    return _tools._genome_db


class ActionCreate(BaseModel):
    gene_symbol: str = "custom"
    action_type: str = "consider"
    title: str
    description: str = ""
    detail: str = ""
    evidence_tier: str = "E5"
    study_count: int = 0
    tags: list[str] = []
    practical_category: str = ""
    health_domain: str = ""


class ActionUpdate(BaseModel):
    done: bool | None = None
    notes: str | None = None
    practical_category: str | None = None
    health_domain: str | None = None


@router.get("")
async def list_actions(profile_id: str = "default"):
    db = _get_db()
    if not db or not db._conn:
        return {"actions": []}
    try:
        async with db._conn.execute(
            "SELECT * FROM action_progress WHERE profile_id = ? ORDER BY created_at DESC",
            (profile_id,),
        ) as cursor:
            rows = await cursor.fetchall()
            return {"actions": [dict(row) for row in rows]}
    except Exception:
        return {"actions": []}


@router.post("")
async def create_action(action: ActionCreate, profile_id: str = "default"):
    db = _get_db()
    if not db or not db._conn:
        raise HTTPException(status_code=503, detail="Database not connected")

    action_id = str(uuid.uuid4())[:8]
    await db._conn.execute(
        """INSERT INTO action_progress
           (id, gene_symbol, action_type, title, done, profile_id, practical_category, health_domain)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)""",
        (action_id, action.gene_symbol, action.action_type, action.title,
         profile_id, action.practical_category, action.health_domain),
    )
    await db._conn.commit()
    return {"id": action_id, "status": "created"}


@router.patch("/{action_id}")
async def update_action(action_id: str, update: ActionUpdate):
    db = _get_db()
    if not db or not db._conn:
        raise HTTPException(status_code=503, detail="Database not connected")

    sets = []
    values = []
    if update.done is not None:
        sets.append("done = ?")
        values.append(1 if update.done else 0)
        if update.done:
            sets.append("done_at = ?")
            values.append(datetime.now().isoformat())
        else:
            sets.append("done_at = NULL")
    if update.notes is not None:
        sets.append("notes = ?")
        values.append(update.notes)
    if update.practical_category is not None:
        sets.append("practical_category = ?")
        values.append(update.practical_category)
    if update.health_domain is not None:
        sets.append("health_domain = ?")
        values.append(update.health_domain)

    if not sets:
        return {"status": "no changes"}

    values.append(action_id)
    await db._conn.execute(
        f"UPDATE action_progress SET {', '.join(sets)} WHERE id = ?",
        values,
    )
    await db._conn.commit()
    return {"id": action_id, "status": "updated"}


@router.delete("/{action_id}")
async def delete_action(action_id: str):
    db = _get_db()
    if not db or not db._conn:
        raise HTTPException(status_code=503, detail="Database not connected")

    await db._conn.execute("DELETE FROM action_progress WHERE id = ?", (action_id,))
    await db._conn.commit()
    return {"id": action_id, "status": "deleted"}
