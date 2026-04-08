"""Orpheus TTS via Groq API.

Handles text chunking (200-char limit), emotional markup,
and audio concatenation for the Orpheus v1 model.
"""
import io
import os
import struct
import wave
from typing import AsyncIterator

from groq import AsyncGroq


MODEL = "canopylabs/orpheus-v1-english"
MAX_CHARS = 200
VOICES = {"tara", "leah", "mia", "jess", "leo", "dan"}
DEFAULT_VOICE = "tara"


def _get_client() -> AsyncGroq:
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        try:
            from scripts.lib.secrets import get_groq_key
            key = get_groq_key()
        except Exception:
            pass
    if not key:
        raise ValueError("GROQ_API_KEY not set. Run `python scripts/setup.py` to configure.")
    return AsyncGroq(api_key=key)


def chunk_text(text: str, max_chars: int = MAX_CHARS) -> list[str]:
    """Split text into chunks respecting sentence boundaries.

    Orpheus has a 200-character limit per request.
    Preserves emotion tags at chunk boundaries.
    """
    if len(text) <= max_chars:
        return [text]

    chunks = []
    remaining = text

    while remaining:
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break

        # Find best split point: sentence end, then comma, then space
        candidate = remaining[:max_chars]
        split_at = -1

        for sep in [". ", "! ", "? ", "; ", ", ", " "]:
            idx = candidate.rfind(sep)
            if idx > 0:
                split_at = idx + len(sep)
                break

        if split_at <= 0:
            split_at = max_chars

        chunks.append(remaining[:split_at].rstrip())
        remaining = remaining[split_at:].lstrip()

    return chunks


def apply_emotion(text: str, emotion: str = "") -> str:
    """Prepend emotion direction tag if specified.

    Orpheus supports: [cheerful], [whisper], [calm], [excited], etc.
    Emotion tags: <laugh>, <sigh>, <gasp>, <cough>, etc.
    """
    if not emotion:
        return text
    # Only add if not already present
    if text.startswith("["):
        return text
    return f"[{emotion}] {text}"


def _concatenate_wav(wav_buffers: list[bytes]) -> bytes:
    """Concatenate multiple WAV byte arrays into a single WAV file."""
    if len(wav_buffers) == 1:
        return wav_buffers[0]

    all_frames = b""
    params = None

    for buf in wav_buffers:
        with wave.open(io.BytesIO(buf), "rb") as wf:
            if params is None:
                params = wf.getparams()
            all_frames += wf.readframes(wf.getnframes())

    if params is None:
        return b""

    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setparams(params)
        wf.writeframes(all_frames)

    return out.getvalue()


async def synthesize(
    text: str,
    voice: str = DEFAULT_VOICE,
    emotion: str = "",
) -> bytes:
    """Generate speech audio from text using Orpheus via Groq.

    Returns WAV bytes. Handles chunking for texts > 200 chars.
    """
    if voice not in VOICES:
        voice = DEFAULT_VOICE

    client = _get_client()
    chunks = chunk_text(text)
    wav_buffers = []

    for chunk in chunks:
        marked = apply_emotion(chunk, emotion)
        response = await client.audio.speech.create(
            model=MODEL,
            input=marked,
            voice=voice,
            response_format="wav",
        )

        wav_buffers.append(response.content)

    return _concatenate_wav(wav_buffers)
