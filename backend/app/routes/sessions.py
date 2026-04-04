"""Session management routes."""
from fastapi import APIRouter, HTTPException

from backend.app.main import users_db

router = APIRouter(prefix="/api")


@router.post("/sessions")
async def create_session():
    return await users_db.create_session()


@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = await users_db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = await users_db.get_messages(session_id)
    return {**session, "messages": messages}
