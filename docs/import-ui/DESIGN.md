# Import Workflow UI — Design (#15)

## Problem
Genome data import is CLI-only (`python3 scripts/genome_init.py <file>`). Non-technical
users cannot get data into the app — this gates *all* first use. This is the highest
accessibility/onboarding win in the backlog.

## Goal
A browser view to upload a raw genome file, see the detected provider/assembly before
committing, run the import, and view results + history — mirroring `genome_init.py`.

## Supported inputs
23andMe (.txt), AncestryDNA (.txt), MyHeritage (.csv), Genotek (.csv), Nebula/Generic VCF
(.vcf, .vcf.gz). Detection reuses `config/provider_formats.yaml` + `scripts/lib/providers`.

## User flow
1. **Pick a file** — drag-drop zone or click to browse (keyboard accessible).
2. **Detect** — on file select, POST `/api/import/detect`; show provider, version, assembly,
   confidence, estimated variants. Detection failure → clear error listing supported formats.
3. **Options** — profile name (optional; placeholder shows auto value), min-r² (VCF only),
   dry-run toggle.
4. **Import** — POST `/api/import/upload`; busy state with aria-live status.
5. **Result** — imported / duplicates / low-r² / total, plus next-steps. Dry-run shows a
   preview-only summary and imports nothing.
6. **History** — past imports (provider, assembly, variants, date) from `GET /api/import/history`.

## Backend (FastAPI) — new router `backend/app/routes/imports_route.py`
Mounted under `/api/import`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/import/detect` | POST (multipart) | Detect format on a saved temp copy; no DB write |
| `/api/import/upload` | POST (multipart + form) | Detect → parse → import into `genome.db` |
| `/api/import/history` | GET | List `profiles`/`imports` rows |

Shared logic extracted from `genome_init.py` into `scripts/lib/importer.py`:
`detect_file(path) -> dict` and `import_genome_file(path, db_path, profile, min_r2, dry_run) -> dict`.
The CLI is refactored to call these so there is **one** import code path.

### Safety
- Uploads streamed to a `tempfile` and deleted after processing.
- File-size cap (configurable; default 200 MB) → 413 on exceed.
- `detect`/`upload` return structured JSON errors (400) on undetectable format.

## Frontend
- New view `'import'` in `App.tsx` union; hash `#/import`; nav button "Import".
- `components/import/ImportView.tsx` — orchestration + layout (HeroHeader → InfoCallout →
  dropzone → detection → options → result → history). Uses existing common components.
- `components/import/DropZone.tsx` — accessible drag-drop + file input.
- `hooks/useImport.ts` — `detect(file)`, `upload(file, opts)`, `history()` via `fetch('/api/import/*')`.
- `components/import/import.css` — dropzone styling on theme tokens.

## Accessibility
- Dropzone is a `<button>` (role/keyboard built in); Enter/Space opens the file dialog;
  `aria-label` describes accepted formats.
- Drag state announced; detection + import status in an `aria-live="polite"` region.
- All inputs have associated `<label>`s; min-r² is a labelled range with text value.
- Honors `prefers-reduced-motion` (already global in `theme.css`).
- Error states use `--sig-danger` tokens with text (not color alone) and `role="alert"`.

## Review findings (folded in)
- Import nav button is **always** visible (not gated by `/api/settings/views`) — import must
  work on an empty DB.
- When total variants == 0, the app lands on `#/import` (first-run onboarding).
- The min-r² control only renders when the detected provider is VCF.
- React conditionally renders states (not the `hidden` attribute) to avoid display bugs.

## Codex audit — resolutions
- **Non-blocking import**: the endpoint offloads the sync parse+sqlite work via
  `starlette.concurrency.run_in_threadpool` so the event loop is never blocked. (A full job
  queue is out of scope for a single-user localhost app.)
- **Upload caps / archive bombs**: stream the upload to a tempfile counting bytes; abort with
  **413** past `MAX_UPLOAD_BYTES` (200 MB). Reject `.zip` with a helpful message. For `.gz`,
  cap decompressed bytes while reading (guard in the importer) to blunt gzip bombs.
- **Transaction safety**: `import_genome_file()` wraps profile + import + SNP inserts so a
  failure marks the import row `status='error'` instead of leaving partial state.
- **Profile conflict**: existing `profile_id` → **409** (no silent merge); auto name stays
  `{provider}_{YYYYMMDD}`.
- **No double full-parse**: `/detect` only reads header lines (`detect_provider`) + a
  size-based variant estimate; the full parse happens once, in `/upload`.
- **Untrusted filename**: tempfile uses a generated name; only the sanitized basename is
  stored; temp paths never appear in error responses.
- **Status codes**: 200 ok · 400 undetectable/invalid · 409 profile exists · 413 too large
  · 415 unsupported media.
- **A11y**: focus moves to the result/error heading on state change; r² help linked via
  `aria-describedby`; history table has a `<caption>`.

## Out of scope
Post-imputation VCF batch import, multi-file ZIP extraction, profile deletion/editing.
