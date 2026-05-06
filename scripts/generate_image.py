#!/usr/bin/env python3
"""GPT Image 2 — zero-dependency image generation via OpenAI API.

Usage:
    generate_image.py "prompt" [output.png]
    generate_image.py --style flat-kahn "your content" out.png
    generate_image.py --style fritz-kahn+retro-terminal "content" out.png
    generate_image.py --edit photo.png "make it warmer" [output.png]
    generate_image.py --quality low "draft concept" out.png
    generate_image.py --n 4 "variations of a logo" out.png
    generate_image.py --size 1536x1024 "wide landscape" out.png
    generate_image.py --list-styles

Environment:
    OPENAI_API_KEY  — required (or decrypted via SOPS from secrets.enc.yaml)
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

GENERATIONS_URL = "https://api.openai.com/v1/images/generations"
EDITS_URL = "https://api.openai.com/v1/images/edits"
MODEL = "gpt-image-2"

COST_PER_IMAGE = {
    "high": 0.21,
    "medium": 0.05,
    "low": 0.006,
}

MAX_RETRIES = 4

STYLES_FILE = Path(__file__).resolve().parent.parent / "styles.yaml"


def load_styles() -> dict[str, dict]:
    """Load style templates from styles.yaml. Returns {key: {prompt, name, ...}}."""
    if not STYLES_FILE.exists():
        return {}
    try:
        import yaml
        with open(STYLES_FILE) as f:
            return yaml.safe_load(f) or {}
    except ImportError:
        pass
    # Fallback: minimal YAML parser for the prompt field only
    styles: dict[str, dict] = {}
    current_key = ""
    current_field = ""
    buffer: list[str] = []
    with open(STYLES_FILE) as f:
        for line in f:
            stripped = line.rstrip()
            if not stripped or stripped.startswith("#"):
                continue
            if not line[0].isspace() and ":" in stripped:
                if current_key and current_field and buffer:
                    styles.setdefault(current_key, {})[current_field] = " ".join(buffer).strip()
                    buffer = []
                    current_field = ""
                current_key = stripped.split(":")[0].strip()
                styles[current_key] = {}
            elif current_key and line.startswith("  ") and not line.startswith("    "):
                if current_field and buffer:
                    styles[current_key][current_field] = " ".join(buffer).strip()
                    buffer = []
                field_line = stripped.strip()
                if ":" in field_line:
                    field_name, _, val = field_line.partition(":")
                    current_field = field_name.strip()
                    val = val.strip().strip(">").strip("|").strip('"').strip("'")
                    if val:
                        buffer = [val]
                    else:
                        buffer = []
            elif current_key and current_field and line.startswith("    "):
                val = stripped.strip().strip('"').strip("'")
                if val and not val.startswith("-"):
                    buffer.append(val)
    if current_key and current_field and buffer:
        styles[current_key][current_field] = " ".join(buffer).strip()
    return styles


def resolve_style_prompt(style_arg: str) -> str:
    """Resolve one or more style keys (joined with +) into a combined prompt prefix."""
    styles = load_styles()
    if not styles:
        print(f"Warning: no styles loaded from {STYLES_FILE}", file=sys.stderr)
        return ""
    parts = []
    for key in style_arg.split("+"):
        key = key.strip()
        if key not in styles:
            print(f"Error: unknown style '{key}'. Available: {', '.join(sorted(styles))}", file=sys.stderr)
            sys.exit(1)
        prompt = styles[key].get("prompt", "")
        if prompt:
            parts.append(prompt.strip())
    return " ".join(parts)


def list_styles() -> None:
    """Print available styles and exit."""
    styles = load_styles()
    if not styles:
        print(f"No styles found. Create {STYLES_FILE}")
        return
    for key, data in styles.items():
        name = data.get("name", key)
        desc = data.get("description", "")
        if desc and len(desc) > 80:
            desc = desc[:77] + "..."
        print(f"  {key:<22} {name}")
        if desc:
            print(f"  {'':<22} {desc}")


def get_api_key() -> str | None:
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    if shutil.which("sops") is None:
        return None
    secrets_paths = [
        Path(__file__).resolve().parent.parent / "config" / "secrets.yaml",
        Path.home() / ".claude" / "skills" / "gpt-image-2" / "secrets.enc.yaml",
        Path.home() / ".claude" / "skills" / "secrets.enc.yaml",
    ]
    for p in secrets_paths:
        if p.exists():
            try:
                result = subprocess.run(
                    ["sops", "--decrypt", "--extract", '["OPENAI_API_KEY"]', str(p)],
                    capture_output=True, text=True, timeout=10,
                )
                if result.returncode == 0 and result.stdout.strip():
                    return result.stdout.strip()
            except (subprocess.TimeoutExpired, FileNotFoundError):
                continue
    return None


def _build_multipart(fields: list[tuple[str, str | bytes, str | None]]) -> tuple[bytes, str]:
    import uuid
    boundary = uuid.uuid4().hex
    lines: list[bytes] = []
    for name, value, filename in fields:
        lines.append(f"--{boundary}".encode())
        if filename:
            ext = Path(filename).suffix.lower()
            mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(ext, "image/png")
            lines.append(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode())
            lines.append(f"Content-Type: {mime}".encode())
        else:
            lines.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        lines.append(b"")
        lines.append(value if isinstance(value, bytes) else value.encode())
    lines.append(f"--{boundary}--".encode())
    body = b"\r\n".join(lines)
    return body, f"multipart/form-data; boundary={boundary}"


def generate(
    prompt: str,
    api_key: str,
    quality: str = "high",
    size: str = "1024x1024",
    n: int = 1,
    edit_image: str | None = None,
) -> list[bytes]:
    """Call OpenAI image API. Returns list of raw PNG bytes."""
    is_edit = bool(edit_image)

    if is_edit:
        fields: list[tuple[str, str | bytes, str | None]] = [
            ("model", MODEL, None),
            ("prompt", prompt, None),
            ("n", str(n), None),
            ("size", size, None),
            ("quality", quality, None),
        ]
        with open(edit_image, "rb") as f:
            fields.append(("image[]", f.read(), Path(edit_image).name))
        data, content_type = _build_multipart(fields)
        url = EDITS_URL
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": content_type}
    else:
        body: dict[str, Any] = {
            "model": MODEL,
            "prompt": prompt,
            "n": n,
            "size": size,
            "quality": quality,
            "output_format": "png",
        }
        data = json.dumps(body).encode()
        url = GENERATIONS_URL
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")

    last_err: str = ""
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                result = json.loads(resp.read())
            images = [base64.b64decode(item["b64_json"]) for item in result.get("data", []) if item.get("b64_json")]
            if not images:
                raise RuntimeError("API returned no image data")
            return images
        except urllib.error.HTTPError as e:
            last_err = e.read().decode("utf-8", errors="replace")[:400] if e.fp else str(e)
            if e.code in (429, 500, 502, 503, 504) and attempt < MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                print(f"  HTTP {e.code}, retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
            else:
                raise RuntimeError(f"HTTP {e.code}: {last_err}") from e
        except urllib.error.URLError as e:
            last_err = str(e.reason)
            if attempt < MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                print(f"  Network error, retrying in {wait}s...", file=sys.stderr)
                time.sleep(wait)
            else:
                raise RuntimeError(f"Network error: {last_err}") from e
    raise RuntimeError(f"Failed after {MAX_RETRIES} attempts: {last_err}")


def make_contact_sheet(images: list[Path], output: Path) -> None:
    if not shutil.which("magick"):
        return
    cols = min(len(images), 3)
    subprocess.run(
        ["magick", "montage"] + [str(p) for p in images] +
        ["-geometry", "+4+4", "-tile", f"{cols}x", str(output)],
        check=True, capture_output=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate images via OpenAI GPT Image 2 API (no dependencies)",
    )
    parser.add_argument("prompt", nargs="?", help="Text prompt")
    parser.add_argument("output", nargs="?", help="Output path (auto-named if omitted)")
    parser.add_argument("--style", "-s", help="Style template key(s) from styles.yaml (combine with +)")
    parser.add_argument("--list-styles", action="store_true", help="List available styles and exit")
    parser.add_argument("--quality", choices=("low", "medium", "high"), default="high")
    parser.add_argument("--size", default="1024x1024", help="1024x1024, 1536x1024, 1024x1536, or auto")
    parser.add_argument("--n", type=int, default=1, help="Number of images (1-10)")
    parser.add_argument("--edit", help="Source image to edit")
    parser.add_argument("--draft", action="store_true", help="Shortcut for --quality low")
    parser.add_argument("--dry-run", action="store_true", help="Show request info without calling API")
    args = parser.parse_args()

    if args.list_styles:
        list_styles()
        return 0

    if not args.prompt:
        parser.error("prompt is required (unless using --list-styles)")

    if args.draft:
        args.quality = "low"

    if args.style:
        style_prefix = resolve_style_prompt(args.style)
        args.prompt = f"{style_prefix} {args.prompt}"

    api_key = get_api_key()
    if not api_key:
        print("Error: OPENAI_API_KEY not set.", file=sys.stderr)
        print("  Set env var, or place in config/secrets.yaml (SOPS-encrypted).", file=sys.stderr)
        return 1

    if args.edit and not Path(args.edit).exists():
        print(f"Error: edit source not found: {args.edit}", file=sys.stderr)
        return 1

    if args.n < 1 or args.n > 10:
        print("Error: --n must be 1-10", file=sys.stderr)
        return 1

    output = Path(args.output) if args.output else Path(f"./gpt-image-{datetime.now().strftime('%Y%m%d-%H%M%S')}.png")
    cost = COST_PER_IMAGE.get(args.quality, 0.21) * args.n

    if args.dry_run:
        print(f"Model:    {MODEL}")
        if args.style:
            print(f"Style:    {args.style}")
        print(f"Quality:  {args.quality}")
        print(f"Size:     {args.size}")
        print(f"N:        {args.n}")
        print(f"Edit:     {args.edit or '(none)'}")
        print(f"Output:   {output}")
        print(f"Est cost: ${cost:.3f}")
        print(f"Prompt:   {args.prompt}")
        return 0

    print(f"Generating ({args.quality}, {args.size}, n={args.n}, ~${cost:.3f})...", file=sys.stderr)
    start = time.time()

    try:
        images = generate(
            prompt=args.prompt,
            api_key=api_key,
            quality=args.quality,
            size=args.size,
            n=args.n,
            edit_image=args.edit,
        )
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    elapsed = time.time() - start
    output.parent.mkdir(parents=True, exist_ok=True)

    saved: list[Path] = []
    if len(images) == 1:
        output.write_bytes(images[0])
        saved.append(output)
        print(f"  {output} ({elapsed:.1f}s, ~${cost:.3f})")
    else:
        for i, img in enumerate(images, 1):
            p = output.with_name(f"{output.stem}-{i:02d}{output.suffix}")
            p.write_bytes(img)
            saved.append(p)
            print(f"  {p}")
        contact = output.with_name(f"{output.stem}-contact{output.suffix}")
        make_contact_sheet(saved, contact)
        if contact.exists():
            print(f"  {contact} (contact sheet)")
        print(f"  ({elapsed:.1f}s, ~${cost:.3f})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
