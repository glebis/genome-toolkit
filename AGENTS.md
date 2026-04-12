# Genome Toolkit — Agent Instructions

## Project Overview

Personal genomics analysis toolkit: FastAPI backend + React/TypeScript frontend + Obsidian vault integration. SQLite stores 3.4M+ genetic variants, Claude Agent SDK powers the AI chat with 11 MCP tools.

## Setup (for AI agents)

```bash
# 1. Install dependencies
pip install -e ".[web]"
cd frontend && npm install && cd ..

# 2. Non-interactive setup (reads API keys from env vars)
python scripts/setup.py --auto --vault ~/genome-vault

# 3. Start backend and frontend
uvicorn backend.app.main:app --port 8000 &
cd frontend && npm run dev
```

Required env var: `ANTHROPIC_API_KEY`. Optional: `GROQ_API_KEY` (TTS), `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`.

### Secrets Management

API keys are stored in **macOS Keychain** (via `scripts/lib/secrets.py`), falling back to `.env`.

For team/CI use, the project supports **SOPS + age** encryption:

```bash
# Install sops and age
brew install sops age

# Decrypt secrets into env vars (requires age key in ~/.config/sops/age/keys.txt)
source scripts/load_secrets.sh

# Edit encrypted secrets
sops config/secrets.yaml
```

`config/secrets.yaml` is SOPS-encrypted and safe to commit. It stores API keys encrypted with age — only holders of the private key can decrypt. See `scripts/load_secrets.sh` for the decryption flow.

### Setup flags

```
--vault PATH         Obsidian vault path
--db PATH            SQLite database path
--tts-provider NAME  orpheus|elevenlabs|deepgram|browser|none
--tts-voice ID       Voice ID (e.g. leo, tara)
--population CODE    EUR|AFR|EAS|SAS|AMR|NFE|FIN
--hide-views NAME+   Hide nav sections (e.g. addiction risk)
--show-views NAME+   Show nav sections
```

## Architecture

- `backend/app/main.py` — FastAPI app, routes, SQLite connections
- `backend/app/agent/` — Claude Agent SDK client + MCP tools
- `backend/app/tts/` — Multi-provider TTS (Groq Orpheus, ElevenLabs, Deepgram, browser fallback)
- `backend/app/routes/` — REST endpoints (snps, chat, vault, gwas, tts, mental-health, checklist)
- `backend/app/db/` — Async SQLite wrappers (genome.db, users.db)
- `frontend/src/App.tsx` — Main app, 5 views, routing via hash fragments
- `frontend/src/components/` — UI components organized by domain
- `frontend/src/hooks/` — Data hooks (useSNPs, useChat, useVoice, usePGxData, etc.)
- `config/settings.yaml` — User config (gitignored), `config/settings.yaml.example` is committed
- `scripts/` — Python pipeline (import, setup, vault query, migrations)

## Key Conventions

- Frontend: React 18 + TypeScript + Vite, IBM Plex Mono font, no CSS framework
- Backend: FastAPI + aiosqlite, versioned migrations in `scripts/data/migrations/`
- Tests: `npx vitest run` (frontend), `python -m pytest tests/` (backend)
- Config is in `config/settings.yaml` (gitignored). API keys in macOS Keychain via `scripts/lib/secrets.py`
- Hash routing: views use `#/pgx`, `#/mental-health`, etc.
- The CommandPalette (Cmd+K) auto-collapses to a right sidebar when AI filters the SNP table

## Running Tests

```bash
cd frontend && npx vitest run      # 362 frontend tests
cd .. && python -m pytest tests/   # 98 backend tests
```

## Common Tasks

- **Add a new view**: Add to `ALL_VIEWS` in `backend/app/main.py`, add component + route in `App.tsx`
- **Add a TTS provider**: Create `backend/app/tts/<name>.py` implementing `TTSProvider`, register in `registry.py`
- **Add an MCP tool**: Add to `backend/app/agent/tools.py`
- **Database migration**: Add `.sql` to `scripts/data/migrations/`, auto-applied on startup
