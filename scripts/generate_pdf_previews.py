#!/usr/bin/env python3

"""Generate JPEG previews for lecture PDFs and lecture-note PDFs.

This script mirrors each PDF in ``static/lectures`` and ``static/lecture-notes``
with a JPEG created from its first page, storing the result in the matching
``previews`` directory. Hugo then uses these previews on the list pages.

Run ``python scripts/generate_pdf_previews.py`` after adding or updating any
lecture PDFs or lecture-note PDFs. Install ImageMagick so the ``magick`` command
is available.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
PDF_COLLECTIONS = (
    ROOT_DIR / "static" / "lectures",
    ROOT_DIR / "static" / "lecture-notes",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate slide previews for lecture PDFs.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate previews even when up-to-date.",
    )
    parser.add_argument(
        "--density",
        type=int,
        default=200,
        help="Rasterization density passed to ImageMagick (default: 200).",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=75,
        help="JPEG quality passed to ImageMagick (default: 75).",
    )
    parser.add_argument(
        "--max-width",
        type=int,
        default=1400,
        help="Resize previews to this maximum width in pixels (default: 1400).",
    )
    return parser.parse_args()


def ensure_environment() -> None:
    if not shutil.which("magick"):
        sys.exit("Error: ImageMagick (magick) is required but was not found in PATH.")
    missing_dirs = [pdf_dir for pdf_dir in PDF_COLLECTIONS if not pdf_dir.exists()]
    if missing_dirs:
        missing_paths = ", ".join(str(path) for path in missing_dirs)
        sys.exit(f"Error: Expected PDF directory at {missing_paths}.")
    for pdf_dir in PDF_COLLECTIONS:
        (pdf_dir / "previews").mkdir(parents=True, exist_ok=True)


def should_render(pdf_path: Path, preview_path: Path, force: bool) -> bool:
    if force or not preview_path.exists():
        return True
    return pdf_path.stat().st_mtime > preview_path.stat().st_mtime


def render_preview(
    pdf_path: Path,
    preview_path: Path,
    density: int,
    quality: int,
    max_width: int,
) -> None:
    preview_tmp = preview_path.with_suffix(".tmp.jpg")
    cmd = [
        "magick",
        "-density",
        str(density),
        f"{pdf_path}[0]",
        "-quality",
        str(quality),
        "-background",
        "white",
        "-alpha",
        "remove",
        "-alpha",
        "off",
        "-strip",
        "-interlace",
        "JPEG",
        "-filter",
        "Lanczos",
        "-resize",
        f"{max_width}x",
        "-sampling-factor",
        "4:2:0",
        str(preview_tmp),
    ]
    subprocess.run(cmd, check=True)
    preview_tmp.replace(preview_path)


def find_pdfs() -> list[tuple[Path, Path]]:
    pdf_pairs: list[tuple[Path, Path]] = []
    for pdf_dir in PDF_COLLECTIONS:
        preview_dir = pdf_dir / "previews"
        for pdf_path in sorted(p for p in pdf_dir.glob("*.pdf") if p.is_file()):
            pdf_pairs.append((pdf_path, preview_dir / pdf_path.with_suffix(".jpg").name))
    return pdf_pairs


def main() -> None:
    args = parse_args()
    ensure_environment()

    pdfs = find_pdfs()
    if not pdfs:
        print("No PDFs discovered under static/lectures or static/lecture-notes - nothing to do.")
        return

    regenerated = 0
    skipped = 0

    for pdf_path, preview_path in pdfs:
        if should_render(pdf_path, preview_path, args.force):
            print(f"Rendering preview for {pdf_path.name} → {preview_path.relative_to(ROOT_DIR)}")
            render_preview(pdf_path, preview_path, args.density, args.quality, args.max_width)
            regenerated += 1
        else:
            skipped += 1

    print(f"Done. Generated {regenerated} preview(s), skipped {skipped} up-to-date file(s).")


if __name__ == "__main__":
    main()
