# Firefox Media HUD extensions

Build the XPIs below, then select either archive under Load Temporary Add-on
in Firefox about:debugging. Packaging includes the common preferences from
shared/ in each XPI.

From a clean checkout, run `python3 tools/package.py` (Python 3.8+) to build
both unsigned XPIs in dist/. Pass `image` or `video-audio` to build only
that extension. Each archive takes its version from its own manifest.
