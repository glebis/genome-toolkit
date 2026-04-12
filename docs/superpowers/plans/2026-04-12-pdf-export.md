# PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate doctor-ready PDF reports from existing markdown exports via a backend WeasyPrint endpoint.

**Architecture:** Frontend sends markdown (from existing `*ToMarkdown()` functions) to `POST /api/export/pdf`. Backend converts markdown→HTML→PDF via WeasyPrint. Returns PDF blob for download.

**Tech Stack:** Python (WeasyPrint, markdown lib), FastAPI, React/TypeScript

**Spec:** `docs/superpowers/specs/2026-04-12-pdf-export-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `pyproject.toml` | Add weasyprint, markdown to [web] deps |
| Modify | `.github/workflows/ci.yml` | Add pango system dep for WeasyPrint |
| Create | `backend/app/services/pdf_renderer.py` | Markdown→HTML→PDF rendering |
| Create | `backend/app/routes/export.py` | POST /api/export/pdf endpoint |
| Modify | `backend/app/main.py:81-101` | Register export router |
| Create | `tests/backend/test_pdf_renderer.py` | Unit tests for renderer |
| Create | `tests/backend/test_export_route.py` | Route integration tests |
| Modify | `frontend/src/lib/export.ts` | Add exportPdf() function |
| Modify | `frontend/src/components/pgx/PGxPanel.tsx:67-68` | Add PDF export button |
| Modify | `frontend/src/App.tsx:188-205` | Handle 'export-pdf' format in handleExport |

---

### Task 1: Add dependencies

**Files:**
- Modify: `pyproject.toml:31-40`
- Modify: `.github/workflows/ci.yml:23-24`

- [ ] **Step 1: Add Python dependencies to pyproject.toml**

In `pyproject.toml`, add `weasyprint` and `markdown` to the `[web]` extras (after line 39, before the closing `]`):

```toml
web = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "aiosqlite>=0.20.0",
    "claude-agent-sdk>=0.1.56",
    "sse-starlette>=2.0.0",
    "groq>=0.11.0",
    "httpx>=0.27.0",
    "keyring>=24.0",
    "weasyprint>=62.0",
    "markdown>=3.5",
]
```

- [ ] **Step 2: Add system dependency to CI**

In `.github/workflows/ci.yml`, before the `pip install` step in the backend job, add:

```yaml
      - name: Install system dependencies
        run: sudo apt-get update && sudo apt-get install -y libpango1.0-dev
```

- [ ] **Step 3: Install locally**

Run: `pip install -e ".[dev,web]"`
Expected: weasyprint and markdown install successfully

- [ ] **Step 4: Commit**

```bash
git add pyproject.toml .github/workflows/ci.yml
git commit -m "chore(#12): add weasyprint and markdown dependencies"
```

---

### Task 2: PDF renderer service — tests

**Files:**
- Create: `tests/backend/test_pdf_renderer.py`

- [ ] **Step 1: Create the test file**

```python
"""Tests for PDF renderer service."""
import pytest
from backend.app.services.pdf_renderer import render_pdf


def test_render_simple_markdown():
    """Render minimal markdown and verify output is a valid PDF."""
    md = "# Test Report\n\nHello world.\n"
    result = render_pdf(md, "pgx")
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_render_with_table():
    """Render markdown with a table."""
    md = (
        "# Report\n\n"
        "| Gene | Status |\n"
        "|------|--------|\n"
        "| CYP2D6 | Intermediate |\n"
    )
    result = render_pdf(md, "pgx")
    assert result[:5] == b"%PDF-"


def test_render_pgx_type_has_title():
    """PGx report type should produce PDF (type affects HTML template)."""
    md = "# PGx Report\n\nContent here.\n"
    result = render_pdf(md, "pgx")
    assert isinstance(result, bytes)
    assert len(result) > 100


def test_render_mental_health_type():
    """Mental health report type should produce PDF."""
    md = "# Mental Health\n\nContent here.\n"
    result = render_pdf(md, "mental-health")
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_render_full_type():
    """Full report type should produce PDF."""
    md = "# Full Report\n\n## Section 1\n\nContent.\n\n## Section 2\n\nMore content.\n"
    result = render_pdf(md, "full")
    assert isinstance(result, bytes)
    assert result[:5] == b"%PDF-"


def test_render_with_metadata():
    """Custom metadata should be accepted without error."""
    md = "# Report\n\nContent.\n"
    result = render_pdf(md, "pgx", metadata={"title": "Custom Title", "date": "2026-04-12"})
    assert result[:5] == b"%PDF-"


def test_render_empty_markdown_raises():
    """Empty markdown should raise ValueError."""
    with pytest.raises(ValueError, match="empty"):
        render_pdf("", "pgx")


def test_render_invalid_type_raises():
    """Invalid report type should raise ValueError."""
    with pytest.raises(ValueError, match="report_type"):
        render_pdf("# Test\n", "invalid-type")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/backend/test_pdf_renderer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.app.services.pdf_renderer'`

---

### Task 3: PDF renderer service — implementation

**Files:**
- Create: `backend/app/services/pdf_renderer.py`

- [ ] **Step 1: Create services directory**

Run: `mkdir -p backend/app/services && touch backend/app/services/__init__.py`

- [ ] **Step 2: Implement the renderer**

```python
"""Markdown-to-PDF renderer using WeasyPrint."""
from datetime import date

import markdown as md_lib
from weasyprint import HTML


VALID_TYPES = {"pgx", "mental-health", "full"}

REPORT_TITLES = {
    "pgx": "PHARMACOGENOMICS REPORT",
    "mental-health": "MENTAL HEALTH GENETIC PROFILE",
    "full": "PERSONAL GENOME REPORT",
}

CSS = """\
@page {
    size: A4;
    margin: 20mm;
    @top-left { content: "GENOME TOOLKIT"; font-family: sans-serif; font-size: 8pt; color: #666; }
    @top-right { content: string(report-date); font-family: sans-serif; font-size: 8pt; color: #666; }
    @bottom-center { content: counter(page); font-family: sans-serif; font-size: 8pt; color: #999; }
}
body {
    font-family: "EB Garamond", "Garamond", "Georgia", serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1a1a1a;
}
h1 {
    font-size: 18pt;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 6pt;
    margin-top: 0;
}
h2 {
    font-size: 13pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #999;
    padding-bottom: 4pt;
    margin-top: 18pt;
}
h3 {
    font-size: 11pt;
    font-weight: bold;
    margin-top: 12pt;
}
table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0;
    font-size: 9pt;
}
th {
    text-align: left;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 8pt;
    letter-spacing: 0.05em;
    border-bottom: 2px solid #333;
    padding: 4pt 6pt;
}
td {
    padding: 4pt 6pt;
    border-bottom: 1px solid #ddd;
    vertical-align: top;
}
tr:nth-child(even) td {
    background: #f5f5f5;
}
code {
    font-family: "JetBrains Mono", "Courier New", monospace;
    font-size: 9pt;
}
blockquote {
    border-left: 3px solid #333;
    margin: 10pt 0;
    padding: 8pt 12pt;
    background: #f9f9f9;
    font-style: italic;
}
.disclaimer {
    border: 1px solid #999;
    padding: 10pt;
    margin: 12pt 0;
    font-size: 9pt;
    text-align: center;
}
.report-date { string-set: report-date content(); }
hr {
    border: none;
    border-top: 1px dashed #999;
    margin: 16pt 0;
}
ul, ol {
    margin: 6pt 0;
    padding-left: 20pt;
}
li {
    margin-bottom: 3pt;
}
"""


def render_pdf(
    markdown_content: str,
    report_type: str,
    metadata: dict | None = None,
) -> bytes:
    """Convert markdown to PDF bytes.

    Args:
        markdown_content: Markdown string to render.
        report_type: One of 'pgx', 'mental-health', 'full'.
        metadata: Optional dict with 'title' and/or 'date' overrides.

    Returns:
        PDF file contents as bytes.

    Raises:
        ValueError: If markdown is empty or report_type is invalid.
    """
    if not markdown_content or not markdown_content.strip():
        raise ValueError("Markdown content is empty")

    if report_type not in VALID_TYPES:
        raise ValueError(f"Invalid report_type '{report_type}'. Must be one of: {VALID_TYPES}")

    meta = metadata or {}
    report_date = meta.get("date") or date.today().isoformat()
    title = meta.get("title") or REPORT_TITLES[report_type]

    html_body = md_lib.markdown(
        markdown_content,
        extensions=["tables", "sane_lists"],
    )

    html = f"""\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{CSS}</style>
</head>
<body>
<span class="report-date" style="display:none">{report_date}</span>
{html_body}
</body>
</html>
"""

    return HTML(string=html).write_pdf()
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `python -m pytest tests/backend/test_pdf_renderer.py -v`
Expected: All 8 tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/__init__.py backend/app/services/pdf_renderer.py tests/backend/test_pdf_renderer.py
git commit -m "feat(#12): add PDF renderer service with tests"
```

---

### Task 4: Export route — tests

**Files:**
- Create: `tests/backend/test_export_route.py`

- [ ] **Step 1: Create the test file**

```python
"""Tests for PDF export route."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from backend.app.routes.export import router
from fastapi import FastAPI

app = FastAPI()
app.include_router(router)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_export_pdf_success(client):
    resp = await client.post("/api/export/pdf", json={
        "markdown": "# Test\n\nHello world.\n",
        "report_type": "pgx",
    })
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:5] == b"%PDF-"
    assert "genome-report-pgx" in resp.headers["content-disposition"]


@pytest.mark.asyncio
async def test_export_pdf_with_metadata(client):
    resp = await client.post("/api/export/pdf", json={
        "markdown": "# Test\n\nContent.\n",
        "report_type": "mental-health",
        "metadata": {"title": "Custom", "date": "2026-01-01"},
    })
    assert resp.status_code == 200
    assert resp.content[:5] == b"%PDF-"


@pytest.mark.asyncio
async def test_export_pdf_empty_markdown(client):
    resp = await client.post("/api/export/pdf", json={
        "markdown": "",
        "report_type": "pgx",
    })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_export_pdf_invalid_type(client):
    resp = await client.post("/api/export/pdf", json={
        "markdown": "# Test\n",
        "report_type": "bogus",
    })
    assert resp.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/backend/test_export_route.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.app.routes.export'`

---

### Task 5: Export route — implementation

**Files:**
- Create: `backend/app/routes/export.py`
- Modify: `backend/app/main.py:81-101`

- [ ] **Step 1: Create the route**

```python
"""PDF export route."""
from datetime import date

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from backend.app.services.pdf_renderer import render_pdf


router = APIRouter()


class ExportRequest(BaseModel):
    markdown: str
    report_type: str
    metadata: dict | None = None


@router.post("/api/export/pdf")
async def export_pdf(req: ExportRequest):
    try:
        pdf_bytes = render_pdf(req.markdown, req.report_type, req.metadata)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    today = date.today().isoformat()
    filename = f"genome-report-{req.report_type}-{today}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

- [ ] **Step 2: Register router in main.py**

In `backend/app/main.py`, add after line 90 (`from backend.app.routes.starter_prompts import router as starter_prompts_router`):

```python
from backend.app.routes.export import router as export_router
```

And after line 101 (`app.include_router(starter_prompts_router)`):

```python
app.include_router(export_router)
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `python -m pytest tests/backend/test_export_route.py -v`
Expected: All 4 tests PASS

- [ ] **Step 4: Run all backend tests**

Run: `python -m pytest tests/ -q`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/export.py backend/app/main.py tests/backend/test_export_route.py
git commit -m "feat(#12): add PDF export route POST /api/export/pdf"
```

---

### Task 6: Frontend `exportPdf()` function

**Files:**
- Modify: `frontend/src/lib/export.ts:15-25`

- [ ] **Step 1: Add exportPdf function**

After the existing `downloadFile()` function (after line 25), add:

```ts
export async function exportPdf(
  markdown: string,
  reportType: 'pgx' | 'mental-health' | 'full',
  metadata?: { title?: string; date?: string },
): Promise<void> {
  const resp = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, report_type: reportType, metadata }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'PDF export failed' }))
    throw new Error(err.detail || 'PDF export failed')
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = resp.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]
    || `genome-report-${reportType}-${new Date().toISOString().slice(0, 10)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/export.ts
git commit -m "feat(#12): add exportPdf() function to frontend"
```

---

### Task 7: PGx PDF export button

**Files:**
- Modify: `frontend/src/components/pgx/PGxPanel.tsx:67-68`

- [ ] **Step 1: Add import**

In PGxPanel.tsx, change line 9:

```ts
import { printPage, downloadFile, pgxToMarkdown } from '../../lib/export'
```

to:

```ts
import { printPage, downloadFile, pgxToMarkdown, exportPdf } from '../../lib/export'
```

- [ ] **Step 2: Add PDF export button**

After line 68 (the existing "Export" button), add:

```tsx
          <ExportButton label="Export PDF" onClick={() => exportPdf(pgxToMarkdown(MOCK_PGX), 'pgx')} />
```

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/pgx/PGxPanel.tsx
git commit -m "feat(#12): add PDF export button to PGx panel"
```

---

### Task 8: Mental Health and Full Report PDF export

**Files:**
- Modify: `frontend/src/App.tsx:20-25,188-205`

- [ ] **Step 1: Add imports**

In `App.tsx`, update the import from `./lib/export` (lines 20-25):

```ts
import {
  printPage,
  downloadFile,
  mentalHealthToMarkdown,
  checklistToMarkdown,
  pgxToMarkdown,
  riskLandscapeToMarkdown,
  addictionToMarkdown,
  exportPdf,
} from './lib/export'
```

- [ ] **Step 2: Add PDF cases to handleExport**

In the `handleExport` callback (line 188), add a new branch before the existing `if` block. Change:

```ts
  const handleExport = useCallback((format: 'pdf' | 'md' | 'doctor' | 'prescriber' | string) => {
    if (format === 'doctor' || format === 'prescriber' || format === 'pdf') {
      printPage(format as 'doctor' | 'prescriber' | 'pdf')
    } else if (format === 'md') {
```

to:

```ts
  const handleExport = useCallback((format: 'pdf' | 'md' | 'doctor' | 'prescriber' | 'export-pdf' | 'export-pdf-full' | string) => {
    if (format === 'export-pdf') {
      if (view === 'mental-health') {
        exportPdf(mentalHealthToMarkdown(mentalHealth.sections, mentalHealth.actions), 'mental-health')
      } else if (view === 'pgx') {
        // PGx handles its own PDF button, but support it here too
        exportPdf(pgxToMarkdown([]), 'pgx')
      }
    } else if (format === 'export-pdf-full') {
      const parts = [
        mentalHealthToMarkdown(mentalHealth.sections, mentalHealth.actions),
        riskLandscapeToMarkdown([]),
        addictionToMarkdown([], []),
      ].filter(p => p.trim().length > 0)
      exportPdf(parts.join('\n\n---\n\n'), 'full')
    } else if (format === 'doctor' || format === 'prescriber' || format === 'pdf') {
      printPage(format as 'doctor' | 'prescriber' | 'pdf')
    } else if (format === 'md') {
```

Note: The empty arrays `[]` above are placeholders — in the real app, the data comes from hooks that are already available in App.tsx scope. The implementer should use the actual hook data variables available in the component (e.g., `mentalHealth.sections`, PGx sections from hooks, etc.). Read the component to find the correct variable names.

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(#12): add mental health and full report PDF export"
```

---

### Task 9: Final integration test

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run all backend tests**

Run: `python -m pytest tests/ -q`
Expected: All tests PASS

- [ ] **Step 3: Manual smoke test**

Start the app (`uvicorn backend.app.main:app --port 8000` + `cd frontend && npm run dev`):
1. Go to PGx view, click "Export PDF" — PDF should download
2. Go to Mental Health view, trigger PDF export — PDF should download
3. Verify PDFs open correctly, have proper formatting, A4 layout

- [ ] **Step 4: Commit any adjustments**

```bash
git add -A
git commit -m "feat(#12): PDF export — final adjustments"
```
