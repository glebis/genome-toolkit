"""Markdown-to-PDF renderer using WeasyPrint."""
import os
from datetime import date

import markdown as md_lib

# WeasyPrint needs GLib/Pango native libs — on macOS with Homebrew they live
# in /opt/homebrew/lib which conda Python doesn't search by default.
if "DYLD_FALLBACK_LIBRARY_PATH" not in os.environ:
    _brew_lib = "/opt/homebrew/lib"
    if os.path.isdir(_brew_lib):
        os.environ["DYLD_FALLBACK_LIBRARY_PATH"] = _brew_lib


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
    @bottom-center { content: "github.com/glebis/genome-toolkit  ·  " counter(page); font-family: sans-serif; font-size: 8pt; color: #999; }
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
    font-size: 13pt;
    font-weight: bold;
    margin-top: 14pt;
    margin-bottom: 4pt;
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
    if not markdown_content or not markdown_content.strip():
        raise ValueError("Markdown content is empty")

    if report_type not in VALID_TYPES:
        raise ValueError(f"Invalid report_type '{report_type}'. Must be one of: {VALID_TYPES}")

    meta = metadata or {}
    report_date = meta.get("date") or date.today().isoformat()
    title = meta.get("title") or REPORT_TITLES[report_type]

    html_body = md_lib.markdown(
        markdown_content,
        extensions=["tables", "sane_lists", "nl2br"],
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

    from weasyprint import HTML  # lazy import — avoid crash if native libs missing at startup
    return HTML(string=html).write_pdf()
