# Firefox Media HUD extensions

Load image/manifest.json or video-audio/manifest.json as a temporary Firefox
add-on in about:debugging during development.

From a clean checkout, run `python3 tools/package.py` (Python 3.8+) to build
both unsigned XPIs in dist/. Pass `image` or `video-audio` to build only
that extension. Each archive takes its version from its own manifest.
