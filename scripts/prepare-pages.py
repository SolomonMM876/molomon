#!/usr/bin/env python3
"""Copy only Molomon's public website files into _site for GitHub Pages."""

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "_site"
PUBLIC_FILES = (
    "index.html", "styles.css", "app.js", "config.js",
    "category.html", "category.css", "category.js",
    "calendar.html", "calendar.css", "calendar.js",
    "backgammon.html", "backgammon.css", "backgammon.js",
    "notes.html", "notes.css", "notes.js",
    "memories.html", "memories.css",
    "suggestions.html", "suggestions.css", "suggestions.js",
    "secret.html", "secret.css", "secret.js",
    "manifest.webmanifest", "install.js", "service-worker.js",
)
ASSET_TYPES = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".js", ".txt"}


def prepare():
    sources = []
    for name in PUBLIC_FILES:
        source = ROOT / name
        if source.is_symlink() or not source.is_file():
            raise SystemExit(f"Missing or unsupported public file: {name}")
        sources.append(source)

    assets = ROOT / "assets"
    if assets.is_symlink():
        raise SystemExit("The assets directory must not be a symbolic link.")
    if assets.exists():
        for source in sorted(assets.rglob("*")):
            relative = source.relative_to(ROOT)
            if source.is_symlink():
                raise SystemExit(f"Symbolic links are not supported: {relative}")
            if source.is_file() and not any(part.startswith(".") for part in relative.parts):
                if source.suffix.lower() in ASSET_TYPES:
                    sources.append(source)

    if OUTPUT.is_symlink():
        raise SystemExit("_site must not be a symbolic link.")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir()

    for source in sources:
        destination = OUTPUT / source.relative_to(ROOT)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    (OUTPUT / ".nojekyll").touch()
    print(f"Prepared {len(sources)} public files in {OUTPUT}")


if __name__ == "__main__":
    prepare()
