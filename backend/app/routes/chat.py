"""Chat SSE endpoint — streams Agent SDK responses to the frontend."""
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from backend.app.main import users_db
from backend.app.agent.agent import create_agent_session, stream_agent_response

router = APIRouter(prefix="/api")

# In-memory store of active agent clients per session
# For single-user self-hosted, this is fine
_active_clients: dict = {}


class ChatRequest(BaseModel):
    session_id: str
    message: str


@router.post("/chat")
async def chat(req: ChatRequest):
    session = await users_db.get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save user message
    await users_db.save_message(req.session_id, "user", req.message)
    await users_db.touch_session(req.session_id)

    # Get or create agent client for this session
    client = _active_clients.get(req.session_id)
    is_new = client is None

    if is_new:
        client, _ = await create_agent_session()
        await client.connect()
        _active_clients[req.session_id] = client

    async def event_stream():
        text_parts = []
        try:
            async for event in stream_agent_response(client, req.message):
                if event["event"] == "text_delta":
                    text_parts.append(event["data"]["content"])
                elif event["event"] == "session_init":
                    agent_sid = event["data"].get("agent_session_id")
                    if agent_sid:
                        await users_db.set_agent_session(req.session_id, agent_sid)

                yield {
                    "event": event["event"],
                    "data": json.dumps(event["data"]),
                }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}),
            }
        finally:
            full_text = "".join(text_parts)
            if full_text:
                await users_db.save_message(req.session_id, "assistant", full_text)

    return EventSourceResponse(event_stream())
