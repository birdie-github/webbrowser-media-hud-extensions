# Firefox Media HUD Extensions

Inspect image formats, resolution, and file size or monitor video resolution,
FPS, dropped frames, and audio and video codecs directly in Firefox. This
repository contains two independently installable extensions for Firefox
desktop and Firefox for Android.

| Firefox add-on | What it shows |
| --- | --- |
| [Image Format & Resolution HUD](https://addons.mozilla.org/en-US/firefox/addon/image-format-resolution-hud/) | Image format, intrinsic and displayed dimensions, scaling, bit depth, file size, and bits per pixel |
| [Video & Audio Codec HUD](https://addons.mozilla.org/en-US/firefox/addon/video-audio-codec-hud/) | Video resolution, measured frame rate (FPS), dropped frames, and video and audio codecs during playback |

## Image Format & Resolution HUD

Check whether a site is serving JPEG, PNG, WebP, AVIF, or another format even
when the image URL gives little away. The HUD compares the browser-reported
intrinsic size with the displayed size to show how the page scales the image.
When the file header supplies enough information, it can also show details
such as bit depth, chroma subsampling, or lossy versus lossless WebP. Bits per
pixel uses the file size and encoded pixel count when both are available.

- **On hover** shows the ℹ️ button when you point at a qualifying image.
- **Automatically for image elements** shows ℹ️ on visible HTML image
  elements that meet the minimum size. CSS background images still use hover.
- **Never** hides the badge and keeps **Show Image Info HUD** available in
  the right-click menu where the extension can identify the image.

Open the panel to inspect the image or use its download button. The default
minimum displayed size is **320 × 240 CSS pixels**, and both dimensions
are configurable.

## Video & Audio Codec HUD

Check what your browser is playing on YouTube and other streaming sites.
The overlay shows the current video resolution, measured FPS, dropped
frames, and codec details such as AV1, VP9, H.264, Opus, or AAC when the
player exposes them. It follows one player at a time and can also show the
audio codec for audio-only playback.

The HUD opens automatically during playback. You can configure it to start
as an ℹ️ button and expand on click. The default minimum displayed video
size is **320 × 240 CSS pixels**.

Sites tested during development include YouTube, TikTok, Twitch, Vimeo,
Kick, Dailymotion, RuTube, and VK Video. Codec availability depends on the
player and stream. For direct media URLs and local files that Firefox
allows the extension to access, playback stats can be available while
codec fields show **Unknown**. A recognizable file extension can appear
as a container hint.

## Appearance and privacy

Both HUDs offer four corner positions and controls for font size,
background opacity, background color, and value text color. Top right is
the default. Each extension stores its preferences separately.

Both extensions process diagnostics locally and collect no telemetry.
The playback HUD uses browser and player information. The image HUD may
request the image URL again to read its header or save the file.

## Build and test locally

From a clean checkout, use Python 3.8 or later to build both unsigned XPIs
in `dist/`.

```sh
python3 tools/package.py
```

Pass `image` or `video-audio` to build just one extension. Each XPI uses
its own manifest version and includes the shared files from `shared/`.
To test a build, open `about:debugging#/runtime/this-firefox`, select
**Load Temporary Add-on**, and choose the XPI. Reload the page you want
to test.

For a compatibility report, include the page URL, Firefox version, and what
the HUD displayed. [Report an issue](https://github.com/birdie-github/webbrowser-media-hud-extensions/issues).

## License

See the [GNU General Public License v3](LICENSE).
