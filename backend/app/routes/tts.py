"""TTS endpoint — converts text to speech via Orpheus/Groq."""
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter(prefix="/api")


class TTSRequest(BaseModel):
    text: str
    voice: str = "tara"
    emotion: str = ""


@router.post("/tts")
async def text_to_speech(req: TTSRequest):
    """Generate speech audio from text.

    Returns WAV audio bytes with appropriate content type.
    Falls back to empty response if TTS is disabled or no API key.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")

    # Check if Groq key is available
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        try:
            from scripts.lib.secrets import get_groq_key
            groq_key = get_groq_key()
        except Exception:
            pass

    if not groq_key:
        raise HTTPException(
            status_code=503,
            detail="TTS not configured. Run `python scripts/setup.py` to set GROQ_API_KEY.",
        )

    try:
        from backend.app.tts import synthesize
        audio_bytes = await synthesize(
            text=req.text,
            voice=req.voice,
            emotion=req.emotion,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {e}")

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": "inline"},
    )


@router.get("/tts/voices")
async def list_voices():
    """List available TTS voices."""
    return {
        "voices": [
            {"id": "tara", "name": "Tara", "description": "Female, conversational, clear"},
            {"id": "leah", "name": "Leah", "description": "Female, warm, gentle"},
            {"id": "mia", "name": "Mia", "description": "Female, professional, articulate"},
            {"id": "jess", "name": "Jess", "description": "Female, energetic"},
            {"id": "leo", "name": "Leo", "description": "Male, confident"},
            {"id": "dan", "name": "Dan", "description": "Male, casual"},
        ],
        "emotions": ["cheerful", "whisper", "calm", "excited", "sad", "angry"],
        "emotion_tags": ["<laugh>", "<sigh>", "<gasp>", "<chuckle>", "<cough>", "<yawn>", "<groan>"],
    }
