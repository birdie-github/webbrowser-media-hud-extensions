#!/usr/bin/env python3
"""Package either Firefox HUD or both from a clean source checkout."""

import argparse
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {"image": "image_format_resolution_hud", "video-audio": "video_audio_codec_hud"}


def package(target):
    source = ROOT / target
    version = json.loads((source / "manifest.json").read_text(encoding="utf-8"))["version"]
    destination = ROOT / "dist" / f"{TARGETS[target]}-{version}.xpi"
    destination.parent.mkdir(exist_ok=True)
    with NamedTemporaryFile(dir=destination.parent, delete=False) as temporary:
        staging = Path(temporary.name)
    try:
        with ZipFile(staging, "w", ZIP_DEFLATED, strict_timestamps=False) as archive:
            for path in sorted(source.rglob("*")):
                if path.is_file() and path != source / "icons/source.jpg":
                    archive.write(path, path.relative_to(source))
            for path in sorted((ROOT / "shared").iterdir()):
                if path.is_file():
                    archive.write(path, path.relative_to(ROOT))
            archive.write(ROOT / "LICENSE", "LICENSE")
        staging.replace(destination)
    finally:
        staging.unlink(missing_ok=True)
    print(destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", nargs="?", choices=TARGETS)
    args = parser.parse_args()
    for name in ([args.target] if args.target else TARGETS):
        package(name)
