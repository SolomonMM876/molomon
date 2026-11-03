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
    "watchroom.html", "watchroom.css", "watchroom.js",
    "suggestions.html", "suggestions.css", "suggestions.js",
    "secret.html", "secret.css", "secret.js",
    "manifest.webmanifest", "install.js", "service-worker.js",
)
ASSET_TYPES = {".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".js", ".txt"}
# Self-contained apps published whole from their own folders: Watchroom and Rummy 500.
APP_DIRS = ("room", "rummy")
APP_TYPES = ASSET_TYPES | {".html", ".css"}


def folder_files(name, types):
    folder = ROOT / name
    if folder.is_symlink():
        raise SystemExit(f"The {name} directory must not be a symbolic link.")
    found = []
    if folder.exists():
        for source in sorted(folder.rglob("*")):
            relative = source.relative_to(ROOT)
            if source.is_symlink():
                raise SystemExit(f"Symbolic links are not supported: {relative}")
            if source.is_file() and not any(part.startswith(".") for part in relative.parts):
                if source.suffix.lower() in types:
                    found.append(source)
    return found


def prepare():
    sources = []
    for name in PUBLIC_FILES:
        source = ROOT / name
        if source.is_symlink() or not source.is_file():
            raise SystemExit(f"Missing or unsupported public file: {name}")
        sources.append(source)

    sources += folder_files("assets", ASSET_TYPES)
    for name in APP_DIRS:
        app_files = folder_files(name, APP_TYPES)
        if not any(source.name == "index.html" for source in app_files):
            raise SystemExit(f"Missing app page: {name}/index.html")
        sources += app_files

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
