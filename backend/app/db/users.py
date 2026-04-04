"""Async SQLite wrapper for users.db (sessions, chat, imports)."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite


class UsersDB:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    async def connect(self):
        self._conn = await aiosqlite.connect(self.db_path)
        self._conn.row_factory = aiosqlite.Row

    async def close(self):
        if self._conn:
            await self._conn.close()

    async def init_schema(self):
        await self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                last_active TEXT NOT NULL,
                agent_session_id TEXT
            );
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
            CREATE TABLE IF NOT EXISTS imports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                provider TEXT NOT NULL,
                variant_count INTEGER,
                imported_at TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
        """)

    async def create_session(self) -> dict:
        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        await self._conn.execute(
            "INSERT INTO sessions (id, created_at, last_active) VALUES (?, ?, ?)",
            [sid, now, now],
        )
        await self._conn.commit()
        return {"id": sid, "created_at": now, "last_active": now}

    async def get_session(self, session_id: str) -> dict | None:
        async with self._conn.execute(
            "SELECT * FROM sessions WHERE id = ?", [session_id]
        ) as c:
            row = await c.fetchone()
            return dict(row) if row else None

    async def touch_session(self, session_id: str):
        now = datetime.now(timezone.utc).isoformat()
        await self._conn.execute(
            "UPDATE sessions SET last_active = ? WHERE id = ?", [now, session_id]
        )
        await self._conn.commit()

    async def set_agent_session(self, session_id: str, agent_session_id: str):
        await self._conn.execute(
            "UPDATE sessions SET agent_session_id = ? WHERE id = ?",
            [agent_session_id, session_id],
        )
        await self._conn.commit()

    async def save_message(self, session_id: str, role: str, content: str):
        now = datetime.now(timezone.utc).isoformat()
        await self._conn.execute(
            "INSERT INTO chat_messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
            [session_id, role, content, now],
        )
        await self._conn.commit()

    async def get_messages(self, session_id: str) -> list[dict]:
        async with self._conn.execute(
            "SELECT role, content, timestamp FROM chat_messages WHERE session_id = ? ORDER BY id",
            [session_id],
        ) as c:
            return [dict(row) for row in await c.fetchall()]

    async def create_import(self, session_id: str, file_path: str, provider: str) -> dict:
        async with self._conn.execute(
            "INSERT INTO imports (session_id, file_path, provider) VALUES (?, ?, ?) RETURNING *",
            [session_id, file_path, provider],
        ) as c:
            row = await c.fetchone()
            await self._conn.commit()
            return dict(row)

    async def update_import(self, import_id: int, **kwargs):
        sets = []
        params = []
        for key, val in kwargs.items():
            sets.append(f"{key} = ?")
            params.append(val)
        params.append(import_id)
        await self._conn.execute(
            f"UPDATE imports SET {', '.join(sets)} WHERE id = ?", params
        )
        await self._conn.commit()

    async def get_import(self, import_id: int) -> dict | None:
        async with self._conn.execute("SELECT * FROM imports WHERE id = ?", [import_id]) as c:
            row = await c.fetchone()
            return dict(row) if row else None
