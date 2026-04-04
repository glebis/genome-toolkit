#!/bin/bash
set -e

echo "=== GENOME_TOOLKIT // SETUP ==="
echo ""

echo "[1/3] INSTALLING_PYTHON_DEPENDENCIES..."
uv pip install --system -e ".[web,dev]"

echo "[2/3] INSTALLING_FRONTEND_DEPENDENCIES..."
cd frontend
npm install
npm run build
cd ..

echo "[3/3] INITIALIZING_DATA_DIRECTORY..."
mkdir -p data

echo ""
echo "=== SETUP_COMPLETE ==="
echo ""
echo "To start:"
echo "  export ANTHROPIC_API_KEY=sk-..."
echo "  export GENOME_DB_PATH=/path/to/genome.db  # optional"
echo "  uvicorn backend.app.main:app --port 8000"
echo ""
echo "Then open http://localhost:8000"
