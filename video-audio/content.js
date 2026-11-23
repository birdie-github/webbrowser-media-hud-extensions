(function () {
  'use strict';

  const defaults = { ...hudDefaults, ...videoActivationDefaults };
  let settings = defaults;
  let settingsReady = false;

  const DEBUG = false;
  const FRAME_TAG = window === window.top ? 'TOP' : `IFRAME(${window.location.hostname || 'blank'})`;

  function dbg(event, ...args) {
    if (!DEBUG) return;
    console.log(`%c[CodecHUD][${FRAME_TAG}] ${event}`, 'color: #38bdf8; font-weight: bold;', ...args);
  }

  function dbgWarn(event, ...args) {
    if (!DEBUG) return;
    console.warn(`%c[CodecHUD][${FRAME_TAG}] ${event}`, 'color: #f59e0b; font-weight: bold;', ...args);
  }

  dbg('Initialized on URL:', window.location.href, 'readyState:', document.readyState);

  function createCodecState() {
    return {
      video: null,
      audio: null,
      rawVideo: null,
      rawAudio: null
    };
  }

  const mediaSourceBuffers = new WeakMap(); // MediaSource -> Map<SourceBuffer, CodecState>
  const bufferOwners = new WeakMap();      // SourceBuffer -> Map<SourceBuffer, CodecState>
  const blobUrlBuffers = new Map();         // blob URL -> Map<SourceBuffer, CodecState>
  const knownMediaElements = new Set();
  const observedMediaElements = new WeakSet();
  const mediaEvents = ['play', 'playing', 'pause', 'ended', 'emptied', 'timeupdate'];

  function formatCodecName(raw) {
    const clean = raw.trim();
    const lower = clean.toLowerCase();
    if (lower.startsWith('av01') || lower === 'av1') return 'AV1';
    if (lower.startsWith('vp09') || lower.startsWith('vp9')) return 'VP9';
    if (lower.startsWith('vp08') || lower.startsWith('vp8')) return 'VP8';
    if (lower.startsWith('avc1') || lower.startsWith('avc3')) return 'H.264';
    if (lower.startsWith('hev1') || lower.startsWith('hvc1')) return 'HEVC';
    if (lower.startsWith('dvh1') || lower.startsWith('dvhe')) return 'Dolby Vision';
    if (lower.startsWith('vvc1') || lower.startsWith('vvi1')) return 'VVC';
    if (lower.startsWith('theora')) return 'Theora';
    if (lower === 'mp4a.40.2') return 'AAC-LC';
    if (lower === 'mp4a.40.5' || lower === 'mp4a.40.29') return 'HE-AAC';
    if (lower.startsWith('mp4a.69') || lower.startsWith('mp4a.6b') || lower === 'mp3') return 'MP3';
    if (lower.startsWith('mp4a')) return 'AAC';
    if (lower.startsWith('opus')) return 'Opus';
    if (lower.startsWith('vorbis')) return 'Vorbis';
    if (lower.startsWith('flac')) return 'FLAC';
    if (lower.startsWith('alac')) return 'ALAC';
    if (lower.startsWith('ec-3')) return 'E-AC-3';
    if (lower.startsWith('ac-3')) return 'AC-3';
    if (lower.startsWith('ac-4')) return 'AC-4';
    return clean.split('.')[0].toUpperCase();
  }

  function parseMimeCodecs(mime) {
    const state = createCodecState();
    const codecMatch = mime.match(/(?:^|;)\s*codecs\s*=\s*["']?([^"';]+)["']?/i);
    if (!codecMatch) return state;

    const codecs = codecMatch[1].split(',').map(codec => codec.trim()).filter(Boolean);
    for (const codec of codecs) {
      if (/^(av01|av1|vp09|vp9|vp08|vp8|avc1|avc3|hev1|hvc1|dvh1|dvhe|vvc1|vvi1|theora)/i.test(codec)) {
        state.rawVideo = codec;
        state.video = formatCodecName(codec);
      } else if (/^(mp4a|mp3|opus|vorbis|flac|alac|ac-3|ec-3|ac-4)/i.test(codec)) {
        state.rawAudio = codec;
        state.audio = formatCodecName(codec);
      }
    }

    if (codecs.length === 1 && !state.video && !state.audio) {
      if (/^video\//i.test(mime)) {
        state.rawVideo = codecs[0];
        state.video = formatCodecName(codecs[0]);
      } else if (/^audio\//i.test(mime)) {
        state.rawAudio = codecs[0];
        state.audio = formatCodecName(codecs[0]);
      }
    }
    return state;
  }

  function buffersForMediaSource(source) {
    let buffers = mediaSourceBuffers.get(source);
    if (!buffers) {
      buffers = new Map();
      mediaSourceBuffers.set(source, buffers);
    }
    return buffers;
  }

  // 1. Universal, Xray-Safe & CSP/TrustedTypes-Immune Hooks via exportFunction
  try {
    const pageWin = window.wrappedJSObject;

    if (pageWin && pageWin.MediaSource && pageWin.MediaSource.prototype) {
      const msProto = pageWin.MediaSource.prototype;
      const origAdd = msProto.addSourceBuffer;

      if (typeof origAdd === 'function') {
        const wrappedAdd = function (mimeType) {
          const sb = Function.prototype.apply.call(origAdd, this, arguments);
          try {
            const buffers = buffersForMediaSource(this);
            buffers.set(sb, parseMimeCodecs(typeof mimeType === 'string' ? mimeType : ''));
            bufferOwners.set(sb, buffers);
          } catch (err) {
            dbgWarn('addSourceBuffer hook error:', err);
          }
          return sb;
        };
        exportFunction(wrappedAdd, msProto, { defineAs: 'addSourceBuffer' });
        dbg('Hooked MediaSource.prototype.addSourceBuffer');
      }

      const origRemove = msProto.removeSourceBuffer;
      if (typeof origRemove === 'function') {
        exportFunction(function (buffer) {
          const result = Function.prototype.apply.call(origRemove, this, arguments);
          bufferOwners.get(buffer)?.delete(buffer);
          bufferOwners.delete(buffer);
          return result;
        }, msProto, { defineAs: 'removeSourceBuffer' });
      }

      if (pageWin.SourceBuffer && pageWin.SourceBuffer.prototype) {
        const sbProto = pageWin.SourceBuffer.prototype;
        const origChange = sbProto.changeType;
        if (typeof origChange === 'function') {
          const wrappedChange = function (mimeType) {
            const result = Function.prototype.apply.call(origChange, this, arguments);
            try {
              bufferOwners.get(this)?.set(this, parseMimeCodecs(typeof mimeType === 'string' ? mimeType : ''));
            } catch (err) {
              dbgWarn('changeType hook error:', err);
            }
            return result;
          };
          exportFunction(wrappedChange, sbProto, { defineAs: 'changeType' });
          dbg('Hooked SourceBuffer.prototype.changeType');
        }
      }

    } else {
      dbgWarn('pageWin.MediaSource unavailable in this frame/compartment');
    }

    // Bind MediaSource instances to their blob: URLs
    if (pageWin && pageWin.URL && typeof pageWin.URL.createObjectURL === 'function') {
      const origCreateObjURL = pageWin.URL.createObjectURL;

      const wrappedCreateObjURL = function (obj) {
        const url = Function.prototype.apply.call(origCreateObjURL, this, arguments);
        try {
          if (url && pageWin.MediaSource && obj instanceof pageWin.MediaSource) {
            if (blobUrlBuffers.size >= 100) {
              const oldestKey = blobUrlBuffers.keys().next().value;
              blobUrlBuffers.delete(oldestKey);
            }
            // Keep associations after revocation for players already using the URL.
            blobUrlBuffers.set(url, buffersForMediaSource(obj));
          }
        } catch (err) {
          dbgWarn('createObjectURL hook error:', err);
        }
        return url;
      };
      exportFunction(wrappedCreateObjURL, pageWin.URL, { defineAs: 'createObjectURL' });
      dbg('Hooked URL.createObjectURL');

    }
    // Hook HTMLMediaElement.prototype.play & load to catch detached <video> elements
    if (pageWin && pageWin.HTMLMediaElement && pageWin.HTMLMediaElement.prototype) {
      const mediaProto = pageWin.HTMLMediaElement.prototype;
      for (const method of ['play', 'load']) {
        const origMethod = mediaProto[method];
        if (typeof origMethod === 'function') {
          const wrappedMethod = function () {
            try {
              observeMedia(this);
              dbg(`Captured media element via HTMLMediaElement.prototype.${method}()`);
            } catch (_) {}
            return Function.prototype.apply.call(origMethod, this, arguments);
          };
          exportFunction(wrappedMethod, mediaProto, { defineAs: method });
        }
      }
    }
  } catch (err) {
    dbgWarn('Failed installing Xray hooks:', err);
  }

  // Secondary YouTube-specific enrichment (reads exact itag string if available)
  function getYouTubePlayerCodecs(mediaEl) {
    try {
      const player = document.getElementById('movie_player');
      if (!player || !player.contains(mediaEl)) return null;
      const rawPlayer = player.wrappedJSObject || player;
      if (rawPlayer && typeof rawPlayer.getStatsForNerds === 'function') {
        const stats = rawPlayer.getStatsForNerds();
        if (stats && typeof stats.codecs === 'string') {
          const parts = stats.codecs.split('/');
          const ytState = createCodecState();
          if (parts[0]) {
            const vRaw = parts[0].trim();
            ytState.rawVideo = vRaw;
            ytState.video = formatCodecName(vRaw);
          }
          if (parts[1]) {
            const aRaw = parts[1].trim();
            ytState.rawAudio = aRaw;
            ytState.audio = formatCodecName(aRaw);
          }
          return ytState;
        }
      }
    } catch (_) {}
    return null;
  }

  // 2. Event-Driven Media Element Discovery (No Periodic Full-DOM Scans)
  function collectMediaElementsOnce(root) {
    if (!root || !root.querySelectorAll) return;
    const media = root.querySelectorAll('video, audio');
    for (const el of media) {
      observeMedia(el);
    }
    if (media.length > 0) {
      dbg(`collectMediaElementsOnce found ${media.length} media element(s) in root:`, root);
    }
    const allNodes = root.querySelectorAll('*');
    for (const node of allNodes) {
      try {
        const shadow = node.openOrClosedShadowRoot || node.shadowRoot;
        if (shadow) {
          collectMediaElementsOnce(shadow);
        }
      } catch (_) {}
    }
  }

  function handleMediaEvent(el, event) {
    knownMediaElements.add(el);
    if (event.type !== 'timeupdate' || pollTimerId === null) tick();
  }

  function observeMedia(el) {
    knownMediaElements.add(el);
    if (observedMediaElements.has(el)) return;
    observedMediaElements.add(el);
    // Media events from detached elements and inside shadow roots may not reach window.
    for (const type of mediaEvents) {
      el.addEventListener(type, event => {
        if (!event.composedPath().includes(window)) handleMediaEvent(el, event);
      });
    }
  }

  // 3. HUD Lifecycle, Timer Management & Layout Throttling
  let hudHost = null;
  let hudContainer = null;
  let infoButton = null;
  let closeButton = null;
  let expanded = false;
  let activeSource = "";
  let ui = null;
  let activeMedia = null;
  let hudDismissed = false;
  let lastFrameCount = 0;
  let lastTimestamp = 0;
  let currentFps = 0;
  let pollTimerId = null;
  let rafId = null;
  const mediaResizeObserver = new ResizeObserver(() => {
    if (pollTimerId === null) tick();
  });

  function startPolling() {
    if (hudDismissed) return;
    if (pollTimerId === null) {
      pollTimerId = setInterval(tick, 500);
    }
  }

  function stopPolling() {
    if (pollTimerId !== null) {
      clearInterval(pollTimerId);
      pollTimerId = null;
    }
  }

  function schedulePositionUpdate() {
    if (rafId !== null || !activeMedia) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (activeMedia && hudContainer && (hudContainer.classList.contains('visible') || !infoButton.hidden)) {
        updateHUDPosition(activeMedia);
      }
    });
  }

  for (const type of mediaEvents) {
    window.addEventListener(type, event => {
      const el = event.composedPath().find(node => node.tagName === 'VIDEO' || node.tagName === 'AUDIO');
      if (!el) return;
      observeMedia(el);
      handleMediaEvent(el, event);
    }, true);
  }

  function createRow(labelText, hasTooltip) {
    const row = document.createElement('div');
    row.className = 'row';

    const { label, val } = createHudFields(labelText);
    if (hasTooltip) val.classList.add("has-tooltip");

    row.appendChild(label);
    row.appendChild(val);
    return { row, val };
  }

  const panelCSS = `

    .info-badge { pointer-events: auto; }
    .hud {
      color: #f8fafc;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: var(--hud-font-size, 11.5px);
      line-height: 1.45;
      padding: 7px 22px 7px 11px;
      position: relative;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
      display: none;
      min-width: 175px;
      box-sizing: border-box;
      pointer-events: none;
    }
    .hud.visible {
      display: block;
    }
    .close-btn {
      position: absolute;
      padding: 0;
      border: 0;
      background: transparent;
      top: 3px;
      right: 5px;
      width: 14px;
      height: 14px;
      line-height: 13px;
      text-align: center;
      font-size: 13px;
      font-weight: 700;
      color: #94a3b8;
      cursor: pointer;
      pointer-events: auto;
      user-select: none;
      border-radius: 3px;
    }
    .close-btn:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.14);
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
    }
    .row.hidden {
      display: none;
    }
    .hud-value {
      font-weight: 600;
      position: relative;
    }
    .hud-value.has-tooltip {
      pointer-events: auto;
      cursor: help;
      text-decoration: underline dotted rgba(56, 189, 248, 0.5);
      text-underline-offset: 2px;
    }
    .hud-value.has-tooltip[data-tooltip]:hover::after {
      content: attr(data-tooltip);
      position: absolute;
      right: 0;
      top: 125%;
      background: #0f172a;
      color: #e2e8f0;
      font-size: 10.5px;
      font-weight: 400;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid rgba(56, 189, 248, 0.55);
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.75);
      z-index: 2147483647;
      pointer-events: none;
    }
  `;

  function buildPlaybackHud() {
    const { host, shadow } = createHudHost(panelCSS);
    hudHost = host;
    hudHost.id = '__media-telemetry-hud-host__';
    hudHost.style.cssText = [
      'position: fixed !important',
      'top: 10px',
      'right: 10px',
      'z-index: 2147483647 !important',
      'pointer-events: none !important',
      'display: block !important',
      'visibility: visible !important',
      'opacity: 1 !important',
      'margin: 0 !important',
      'padding: 0 !important'
    ].join(';');

    hudContainer = document.createElement('div');
    hudContainer.className = 'hud hud-panel';

    infoButton = createHudButton('info-badge', 'ℹ️', 'Show Playback Info HUD', () => {
      expanded = true;
      tick();
      if (hudContainer.classList.contains('visible')) closeButton.focus();
    });
    infoButton.hidden = true;

    closeButton = createHudButton('close-btn', '×', 'Hide HUD until page reload', () => {
      if (settings.showInfoButton) {
        expanded = false;
        tick();
        if (!infoButton.hidden) infoButton.focus();
        return;
      }
      hudDismissed = true;
      hudContainer.classList.remove('visible');
      stopPolling();
      dbg('HUD dismissed by user until reload');
    });
    hudContainer.appendChild(closeButton);

    const resRow = createRow('RES', false);
    const fpsRow = createRow('FPS', false);
    const vcodecRow = createRow('VCODEC', true);
    const modeRow = createRow('MODE', false);
    const acodecRow = createRow('ACODEC', true);
    const containerRow = createRow('CONTAINER', false);

    hudContainer.appendChild(resRow.row);
    hudContainer.appendChild(fpsRow.row);
    hudContainer.appendChild(vcodecRow.row);
    hudContainer.appendChild(modeRow.row);
    hudContainer.appendChild(acodecRow.row);

    hudContainer.appendChild(containerRow.row);
    ui = { resRow, fpsRow, vcodecRow, modeRow, acodecRow, containerRow };

    applyHudAppearance(hudContainer, settings);
    shadow.appendChild(hudContainer);
    shadow.appendChild(infoButton);
  }

  function ensureHUD() {
    if (hudDismissed) return false;
    let targetParent = document.fullscreenElement || document.body || document.documentElement;
    if (!targetParent) {
      dbgWarn('ensureHUD: No targetParent available');
      return false;
    }

    if (targetParent.tagName === 'VIDEO' || targetParent.tagName === 'AUDIO') {
      targetParent = targetParent.parentElement || document.body || document.documentElement;
    }

    if (!hudHost) buildPlaybackHud();

    if (hudHost.parentElement !== targetParent) {
      targetParent.appendChild(hudHost);
      dbg('Attached HUD host to parent:', targetParent.tagName);
    }

    return true;
  }

  function parseObjectPositionFactor(posToken) {
    if (!posToken) return 0.5;
    if (posToken === 'left' || posToken === 'top') return 0;
    if (posToken === 'right' || posToken === 'bottom') return 1;
    if (posToken === 'center') return 0.5;
    if (posToken.endsWith('%')) {
      const pct = parseFloat(posToken);
      if (!Number.isNaN(pct)) return pct / 100;
    }
    return 0.5;
  }

  function updateHUDPosition(mediaEl) {
    if (!hudHost || !hudContainer) return;

    const isVideo = mediaEl.tagName === 'VIDEO' && mediaEl.videoWidth > 0 && mediaEl.videoHeight > 0;
    if (isVideo) {
      const rect = mediaEl.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) {
        const videoRatio = mediaEl.videoWidth / mediaEl.videoHeight;
        const elementRatio = rect.width / rect.height;
        let renderWidth = rect.width;
        let renderHeight = rect.height;

        const style = window.getComputedStyle(mediaEl);
        const objectFit = style.objectFit || 'fill';

        const isSmallerThanBox = mediaEl.videoWidth < rect.width && mediaEl.videoHeight < rect.height;
        const effectiveFit = objectFit === 'scale-down'
          ? (isSmallerThanBox ? 'none' : 'contain')
          : objectFit;

        if (effectiveFit === 'contain') {
          if (elementRatio > videoRatio) {
            renderWidth = rect.height * videoRatio;
          } else {
            renderHeight = rect.width / videoRatio;
          }
        } else if (effectiveFit === 'none') {
          renderWidth = Math.min(rect.width, mediaEl.videoWidth);
          renderHeight = Math.min(rect.height, mediaEl.videoHeight);
        }

        const posParts = (style.objectPosition || '50% 50%').trim().split(/\s+/);
        const factorX = parseObjectPositionFactor(posParts[0]);
        const factorY = parseObjectPositionFactor(posParts[1] || posParts[0]);

        const offsetX = (rect.width - renderWidth) * factorX;
        const offsetY = (rect.height - renderHeight) * factorY;

        const vpWidth = document.documentElement.clientWidth || window.innerWidth;
        const vpHeight = document.documentElement.clientHeight || window.innerHeight;
        const hudHeight = infoButton.hidden ? hudContainer.offsetHeight : infoButton.offsetHeight;
        const hudWidth = infoButton.hidden ? hudContainer.offsetWidth : infoButton.offsetWidth;

        const rawTop = rect.top + offsetY + 10;
        const rawRight = vpWidth - (rect.left + offsetX + renderWidth) + 10;

        const topPx = Math.min(Math.max(8, rawTop), Math.max(8, vpHeight - hudHeight - 8));
        const rightPx = Math.min(Math.max(8, rawRight), Math.max(8, vpWidth - hudWidth - 8));

        hudHost.style.setProperty('top', `${Math.round(topPx)}px`, 'important');
        hudHost.style.setProperty('right', `${Math.round(rightPx)}px`, 'important');
        hudHost.style.removeProperty('left');
        return;
      }
    }

    hudHost.style.setProperty('top', '12px', 'important');
    hudHost.style.setProperty('right', '12px', 'important');
  }

  function getContainerHint(mediaEl) {
    const src = mediaEl.currentSrc || mediaEl.src || '';
    if (!src || mediaEl.srcObject) return null;
    try {
      const url = new URL(src, window.location.href);
      if (url.protocol === 'blob:') return null;
      const ext = /\.([a-z0-9]+)$/i.exec(url.pathname)?.[1].toLowerCase();
      if (['mp4', 'webm', 'ogg', 'mp3', 'wav', 'flac', 'm4a', 'aac', 'opus', 'mkv', 'mov'].includes(ext)) {
        return `.${ext} (URL)`;
      }
    } catch (_) {}
    return null;
  }

  function resolveCodecsForElement(mediaEl) {
    const state = getYouTubePlayerCodecs(mediaEl) || createCodecState();
    const buffers = mediaEl.srcObject
      ? mediaSourceBuffers.get(mediaEl.srcObject)
      : blobUrlBuffers.get(mediaEl.currentSrc);
    if (!buffers) return state;

    for (const [kind, rawKey] of [['video', 'rawVideo'], ['audio', 'rawAudio']]) {
      if (state[kind]) continue;
      let candidate = null;
      for (const codec of buffers.values()) {
        if (!codec[rawKey]) continue;
        if (candidate && candidate[rawKey] !== codec[rawKey]) {
          candidate = null;
          break;
        }
        candidate = codec;
      }
      if (candidate) {
        state[kind] = candidate[kind];
        state[rawKey] = candidate[rawKey];
      }
    }
    return state;
  }

  function meetsMinimumDimensions(el) {
    if (el.tagName !== 'VIDEO') return true;
    const { width, height } = el.getBoundingClientRect();
    return width >= settings.minWidth && height >= settings.minHeight;
  }

  function findPlayingMedia() {
    let video = null;
    let fallback = null;
    let hasPlayback = false;
    for (const el of knownMediaElements) {
      if (el.paused || el.ended) {
        if (!el.isConnected) knownMediaElements.delete(el);
        continue;
      }
      hasPlayback = true;
      if (el.readyState < 2 || video || !meetsMinimumDimensions(el)) continue;

      if (el.tagName === 'VIDEO' && el.videoWidth > 0) {
        video = el;
      } else if (!fallback) {
        fallback = el;
      }
    }

    if (hasPlayback) startPolling();
    else stopPolling();
    return video || fallback;
  }

  function tick() {
    if (!settingsReady) return;
    if (hudDismissed) {
      if (hudContainer) hudContainer.classList.remove('visible');
      if (infoButton) infoButton.hidden = true;
      stopPolling();
      return;
    }

    let playingEl = findPlayingMedia();

    if (!playingEl && activeMedia && activeMedia.isConnected) {
      playingEl = activeMedia;
    }

    if (!playingEl) {
      mediaResizeObserver.disconnect();
      activeMedia = null;
      if (hudContainer) hudContainer.classList.remove('visible');
      if (infoButton) infoButton.hidden = true;
      return;
    }

    const source = playingEl.currentSrc || playingEl.src || "";
    if (activeMedia !== playingEl || activeSource !== source) {
      activeSource = source;
      expanded = false;
      dbg('Switched activeMedia to:', {
        tag: playingEl.tagName,
        src: playingEl.currentSrc || playingEl.src,
        res: `${playingEl.videoWidth}x${playingEl.videoHeight}`,
        isConnected: playingEl.isConnected
      });
      if (activeMedia !== playingEl) {
        mediaResizeObserver.disconnect();
        if (playingEl.isConnected) mediaResizeObserver.observe(playingEl);
      }
      activeMedia = playingEl;
      lastFrameCount = 0;
      lastTimestamp = 0;
      currentFps = 0;
    }

    if (!meetsMinimumDimensions(activeMedia)) {
      if (hudContainer) hudContainer.classList.remove('visible');
      if (infoButton) infoButton.hidden = true;
      lastTimestamp = 0;
      currentFps = 0;
      return;
    }

    if (!ensureHUD() || !ui) return;
    closeButton.title = settings.showInfoButton ? 'Collapse to info button' : 'Hide HUD until page reload';
    closeButton.setAttribute('aria-label', closeButton.title);
    infoButton.hidden = !settings.showInfoButton || expanded;
    if (!infoButton.hidden) {
      hudContainer.classList.remove('visible');
      lastTimestamp = 0;
      currentFps = 0;
      updateHUDPosition(activeMedia);
      return;
    }

    const isVideo = activeMedia.tagName === 'VIDEO' && activeMedia.videoWidth > 0;
    const now = performance.now();
    const rate = activeMedia.playbackRate > 0 ? activeMedia.playbackRate : 1;

    if (activeMedia.paused || activeMedia.ended) {
      currentFps = 0;
      lastTimestamp = 0;
    } else if (isVideo && typeof activeMedia.getVideoPlaybackQuality === 'function') {
      const quality = activeMedia.getVideoPlaybackQuality();
      const totalFrames = quality.totalVideoFrames;
      const elapsed = now - lastTimestamp;

      if (lastTimestamp > 0 && elapsed >= 450) {
        const frameDelta = totalFrames - lastFrameCount;
        const presentedFps = Math.max(0, (frameDelta / elapsed) * 1000);
        currentFps = presentedFps / rate;
        lastFrameCount = totalFrames;
        lastTimestamp = now;
      } else if (lastTimestamp === 0) {
        lastFrameCount = totalFrames;
        lastTimestamp = now;
      }
    }

    const activeCodecs = resolveCodecsForElement(activeMedia);
    const container = getContainerHint(activeMedia);
    ui.containerRow.row.classList.toggle('hidden', !container);
    ui.containerRow.val.textContent = container || '';

    const vCodecName = activeCodecs.video || 'Unknown';
    const vCodecTooltip = activeCodecs.rawVideo || 'No detailed codec parameters';

    const aCodecName = activeCodecs.audio || 'Unknown';
    const aCodecTooltip = activeCodecs.rawAudio || 'No detailed codec parameters';

    if (isVideo) {
      const quality = activeMedia.getVideoPlaybackQuality ? activeMedia.getVideoPlaybackQuality() : null;
      const dropped = quality ? quality.droppedVideoFrames : 0;
      const rateSuffix = rate !== 1 ? ` @${Number(rate.toFixed(2))}x` : '';

      ui.resRow.row.classList.remove('hidden');
      ui.fpsRow.row.classList.remove('hidden');
      ui.vcodecRow.row.classList.remove('hidden');
      ui.modeRow.row.classList.add('hidden');

      ui.resRow.val.textContent = `${activeMedia.videoWidth} × ${activeMedia.videoHeight}`;
      ui.fpsRow.val.textContent = `${currentFps.toFixed(1)}${rateSuffix} (${dropped} drop)`;
      ui.vcodecRow.val.textContent = vCodecName;
      ui.vcodecRow.val.setAttribute('data-tooltip', vCodecTooltip);
    } else {
      ui.resRow.row.classList.add('hidden');
      ui.fpsRow.row.classList.add('hidden');
      ui.vcodecRow.row.classList.add('hidden');
      ui.modeRow.row.classList.remove('hidden');

      ui.modeRow.val.textContent = 'Audio Only';
    }

    ui.acodecRow.val.textContent = aCodecName;
    ui.acodecRow.val.setAttribute('data-tooltip', aCodecTooltip);

    hudContainer.classList.add('visible');
    updateHUDPosition(activeMedia);
  }

  // Discover existing players once, then rely on playback events and media hooks.
  function discoverExistingMedia() {
    collectMediaElementsOnce(document);
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', discoverExistingMedia, { once: true });
  } else {
    discoverExistingMedia();
  }

  window.addEventListener('scroll', schedulePositionUpdate, { passive: true, capture: true });
  window.addEventListener('resize', schedulePositionUpdate, { passive: true });

  document.addEventListener('fullscreenchange', () => {
    if (activeMedia) {
      ensureHUD();
      schedulePositionUpdate();
    }
  });
  watchHudSettings(defaults, nextSettings => {
    if (settings.showInfoButton !== nextSettings.showInfoButton) {
      expanded = false;
      hudDismissed = false;
    }
    settings = nextSettings;
    if (hudContainer) applyHudAppearance(hudContainer, settings);
    if (settingsReady && !hudDismissed) {
      tick();
    }
  }).then(() => {
    settingsReady = true;
    tick();
  });
})();
