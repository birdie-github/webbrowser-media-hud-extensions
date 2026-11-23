"use strict";

(() => {
  if (window.__imageFormatHudInitialized) return;
  window.__imageFormatHudInitialized = true;

  const DEFAULT_SETTINGS = { ...hudDefaults, ...imageActivationDefaults };

  let settings = { ...DEFAULT_SETTINGS };

  // State Management
  let hoveredImg = null;
  let pinnedImg = null;
  let activeTargetUrl = "";
  let activeMutationObserver = null;
  let activeResizeObserver = null;
  let lastContextCandidate = null;
  let lastContextPoint = { x: 0, y: 0, time: 0 };
  let isPointerOverBadge = false;
  let rafId = null;
  let hoverFrameId = null;
  let hoverX = 0;
  let hoverY = 0;
  let diagnosticRequestId = 0;

  // Per-URL parsed diagnostics cache
  const diagnosticsCache = new Map();

  // Per-Element CSS background-image metadata & intrinsic dimension cache
  const bgElementCache = new WeakMap();

  // Closed Shadow DOM UI references
  let hostEl = null;
  let shadowRoot = null;
  let containerEl = null;
  let badgeBtn = null;
  let panelEl = null;
  let closeBtn = null;
  let downloadBtn = null;
  let rowElements = {};

  function revalidateActiveImages() {
    if (pinnedImg && !isQualifyingImage(pinnedImg)) {
      closeExpandedHud();
    }
    if (hoveredImg && (!settings.showHoverButton || !isQualifyingImage(hoveredImg))) {
      if (!pinnedImg) hideAll();
      hoveredImg = null;
    }
    schedulePositionUpdate();
  }

  // Build Closed Shadow DOM strictly with createElement & textContent (TrustedTypes safe)
  function ensureHudDOM() {
    if (hostEl && document.body && document.body.contains(hostEl)) return;
    if (!document.body) return;

    hostEl = document.createElement("div");
    hostEl.style.all = "initial";
    hostEl.style.position = "fixed";
    hostEl.style.top = "0px";
    hostEl.style.left = "0px";
    hostEl.style.width = "0px";
    hostEl.style.height = "0px";
    hostEl.style.zIndex = "2147483647";
    hostEl.style.pointerEvents = "none";

    shadowRoot = hostEl.attachShadow({ mode: "closed" });

    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host {
        all: initial;
      }
      .hud-anchor {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 2147483647;
        pointer-events: auto;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: var(--hud-font-size, 11.5px);
        line-height: 1.45;
        color: #38bdf8;
        user-select: none;
        -webkit-user-select: none;
        box-sizing: border-box;
      }
      .hud-hidden {
        display: none !important;
      }
      ${hudInfoButtonCSS}
      .hud-panel {
        min-width: 248px;
        max-width: 340px;
        background: color-mix(in srgb, var(--hud-background, #0f1117) var(--hud-opacity, 88%), transparent);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(56, 189, 248, 0.45);
        border-radius: 6px;
        padding: 8px 10px 9px 10px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
        color: #38bdf8;
        user-select: text;
        -webkit-user-select: text;
      }
      .hud-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        border-bottom: 1px solid rgba(56, 189, 248, 0.22);
        padding-bottom: 4px;
        margin-bottom: 6px;
      }
      .hud-title {
        font-weight: 700;
        font-size: 10.5px;
        letter-spacing: 0.08em;
        color: #94a3b8;
        text-transform: uppercase;
        margin-right: auto;
      }
      .hud-icon-btn {
        all: unset;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 4px;
        color: #94a3b8;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        transition: color 0.12s ease, background 0.12s ease;
      }
      .hud-icon-btn:hover {
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.16);
      }
      .hud-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        column-gap: 10px;
        row-gap: 3px;
        align-items: baseline;
      }
      .hud-label {
        color: #94a3b8;
        font-weight: 600;
        letter-spacing: 0.03em;
        white-space: nowrap;
      }
      .hud-value {
        color: var(--hud-text, #38bdf8);
        text-align: right;
        word-break: break-word;
      }
    `;

    containerEl = document.createElement("div");
    containerEl.className = "hud-anchor hud-hidden";

    // State 2: Floating Hover Badge (ℹ️)
    badgeBtn = document.createElement("button");
    badgeBtn.type = "button";
    badgeBtn.className = "info-badge hud-hidden";
    badgeBtn.title = "Inspect Image Format & Resolution";
    badgeBtn.textContent = "\u2139\uFE0F";

    badgeBtn.addEventListener("mouseenter", () => {
      isPointerOverBadge = true;
    });
    badgeBtn.addEventListener("mouseleave", (e) => {
      isPointerOverBadge = false;
      scheduleHoverHitTest(e.clientX, e.clientY);
    });
    badgeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (hoveredImg) {
        openExpandedHud(hoveredImg);
      }
    }, true);

    // State 3: Expanded HUD Panel
    panelEl = document.createElement("div");
    panelEl.className = "hud-panel hud-hidden";
    panelEl.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    const headerEl = document.createElement("div");
    headerEl.className = "hud-header";

    const titleEl = document.createElement("span");
    titleEl.className = "hud-title";
    titleEl.textContent = "Info";

    downloadBtn = document.createElement("a");
    downloadBtn.className = "hud-icon-btn";
    downloadBtn.title = "Download Image (Left-click to save, Middle-click to open)";
    downloadBtn.target = "_blank";
    downloadBtn.rel = "noopener noreferrer";
    downloadBtn.textContent = "\u2B07\uFE0F";
    downloadBtn.addEventListener("click", (e) => {
      // Allow middle-click or Ctrl/Cmd-click to open raw image in a new tab naturally
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      triggerImageDownload(pinnedImg);
    }, true);

    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "hud-icon-btn";
    closeBtn.title = "Close HUD";
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeExpandedHud();
    }, true);

    headerEl.appendChild(titleEl);
    headerEl.appendChild(downloadBtn);
    headerEl.appendChild(closeBtn);

    const gridEl = document.createElement("div");
    gridEl.className = "hud-grid";

    const fields = [
      { key: "intrinsic", label: "INTRINSIC" },
      { key: "displayed", label: "DISPLAYED" },
      { key: "format", label: "FORMAT" },
      { key: "size", label: "SIZE" },
      { key: "details", label: "DETAILS" }
    ];

    rowElements = {};
    for (const f of fields) {
      const lbl = document.createElement("div");
      lbl.className = "hud-label";
      lbl.textContent = f.label;

      const val = document.createElement("div");
      val.className = "hud-value";
      val.textContent = "\u2026";

      gridEl.appendChild(lbl);
      gridEl.appendChild(val);
      rowElements[f.key] = { lbl, val };
    }

    panelEl.appendChild(headerEl);
    panelEl.appendChild(gridEl);

    containerEl.appendChild(badgeBtn);
    containerEl.appendChild(panelEl);
    shadowRoot.appendChild(styleEl);
    shadowRoot.appendChild(containerEl);
    applyHudAppearance(containerEl, settings);
    document.body.appendChild(hostEl);
  }

  // Extract first valid HTTP/HTTPS/Data URL from CSS background-image
  function extractCssBackgroundUrl(bgImageValue) {
    if (!bgImageValue || bgImageValue === "none") return null;
    const match = /url\(\s*(['"]?)(.*?)\1\s*\)/i.exec(bgImageValue);
    if (!match || !match[2]) return null;
    const rawUrl = match[2].trim();
    if (!rawUrl) return null;
    try {
      return new URL(rawUrl, location.href).href;
    } catch (e) {
      return rawUrl;
    }
  }

  // Probe & cache intrinsic dimensions for CSS background-image elements
  function getOrProbeBackgroundMeta(el, bgUrl) {
    let meta = bgElementCache.get(el);
    if (meta && meta.url === bgUrl) {
      return meta;
    }
    meta = {
      url: bgUrl,
      naturalWidth: 0,
      naturalHeight: 0,
      loaded: false,
      probing: true
    };
    bgElementCache.set(el, meta);

    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      meta.naturalWidth = probe.naturalWidth || probe.width || 0;
      meta.naturalHeight = probe.naturalHeight || probe.height || 0;
      meta.loaded = true;
      meta.probing = false;
      if (pinnedImg === el) {
        populateDiagnostics(el);
      } else if (hoveredImg === el) {
        schedulePositionUpdate();
      }
    };
    probe.onerror = () => {
      meta.probing = false;
    };
    probe.src = bgUrl;
    return meta;
  }

  function getTargetUrl(node) {
    if (!node) return "";
    if (node.nodeName === "IMG") {
      return node.currentSrc || node.src || "";
    }
    const style = window.getComputedStyle(node);
    return extractCssBackgroundUrl(style.backgroundImage) || "";
  }

  function getTargetIntrinsicSize(node) {
    if (!node) return { nw: 0, nh: 0 };
    if (node.nodeName === "IMG") {
      return { nw: node.naturalWidth || 0, nh: node.naturalHeight || 0 };
    }
    const bgUrl = getTargetUrl(node);
    if (!bgUrl) return { nw: 0, nh: 0 };
    const meta = getOrProbeBackgroundMeta(node, bgUrl);
    return { nw: meta.naturalWidth, nh: meta.naturalHeight };
  }

  // Strict CSS Bounding Box Filtering
  function isQualifyingImage(node) {
    if (!node || !node.isConnected || node.nodeType !== 1) return false;
    if (node === document.body || node === document.documentElement) return false;

    const style = window.getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity) === 0
    ) {
      return false;
    }

    if (node.nodeName !== "IMG") {
      const bgUrl = extractCssBackgroundUrl(style.backgroundImage);
      if (!bgUrl) return false;
      getOrProbeBackgroundMeta(node, bgUrl);
    }

    const rect = node.getBoundingClientRect();
    return (
      rect.width >= settings.minWidth &&
      rect.height >= settings.minHeight
    );
  }

  // Verify that the active image has not been hidden by an ancestor, clipped out by a carousel, or had its URL swapped
  function isTargetStillPresent(img, expectedUrl) {
    if (!img || !img.isConnected) return false;
    if (!isQualifyingImage(img)) return false;

    const currentUrl = getTargetUrl(img);
    if (!currentUrl || (expectedUrl && currentUrl !== expectedUrl)) {
      return false;
    }

    // Walk ancestors to catch opacity: 0, visibility: hidden, or carousel overflow clipping
    // Note: Do NOT clamp to window.innerWidth/innerHeight here so normal page scrolling doesn't kill a pinned HUD
    const imgRect = img.getBoundingClientRect();
    let clipLeft = imgRect.left;
    let clipTop = imgRect.top;
    let clipRight = imgRect.right;
    let clipBottom = imgRect.bottom;

    let curr = img.parentElement || (img.getRootNode && img.getRootNode().host) || null;
    while (curr && curr !== document.documentElement && curr !== document.body) {
      const st = window.getComputedStyle(curr);
      if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) {
        return false;
      }
      const ovX = st.overflowX;
      const ovY = st.overflowY;
      if (
        ovX === "hidden" || ovX === "clip" || ovX === "scroll" || ovX === "auto" ||
        ovY === "hidden" || ovY === "clip" || ovY === "scroll" || ovY === "auto"
      ) {
        const cRect = curr.getBoundingClientRect();
        clipLeft = Math.max(clipLeft, cRect.left);
        clipTop = Math.max(clipTop, cRect.top);
        clipRight = Math.min(clipRight, cRect.right);
        clipBottom = Math.min(clipBottom, cRect.bottom);
      }
      curr = curr.parentElement || (curr.getRootNode && curr.getRootNode().host) || null;
    }

    // If clipped by an ancestor container (e.g. inactive carousel slide) to < 48px, dismiss HUD
    if (clipRight - clipLeft < 48 || clipBottom - clipTop < 48) {
      return false;
    }

    // If the clipped box is currently inside the viewport, verify the target is still in the hit-test stack
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const visLeft = Math.max(0, clipLeft);
    const visTop = Math.max(0, clipTop);
    const visRight = Math.min(vw, clipRight);
    const visBottom = Math.min(vh, clipBottom);

    if (visRight - visLeft >= 48 && visBottom - visTop >= 48) {
      const probeX = visLeft + (visRight - visLeft) * 0.5;
      const probeY = visTop + (visBottom - visTop) * 0.5;
      const stack = document.elementsFromPoint(probeX, probeY);
      let foundInStack = false;
      for (const el of stack) {
        if (el === img || el.contains(img) || (el.openOrClosedShadowRoot && el.openOrClosedShadowRoot.contains(img))) {
          foundInStack = true;
          break;
        }
      }
      if (!foundInStack) {
        return false;
      }
    }

    return true;
  }

  function startActiveTargetWatchers(img) {
    stopActiveTargetWatchers();
    if (!img) return;

    if (typeof ResizeObserver === "function") {
      activeResizeObserver = new ResizeObserver(() => schedulePositionUpdate());
      activeResizeObserver.observe(img);
    }

    if (typeof MutationObserver === "function" && document.documentElement) {
      activeMutationObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.target === hostEl) continue;
          schedulePositionUpdate();
          break;
        }
      });
      activeMutationObserver.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["style", "class", "src", "srcset", "hidden", "aria-hidden"]
      });
    }
  }

  function stopActiveTargetWatchers() {
    if (activeResizeObserver) {
      activeResizeObserver.disconnect();
      activeResizeObserver = null;
    }
    if (activeMutationObserver) {
      activeMutationObserver.disconnect();
      activeMutationObserver = null;
    }
  }

  // Resolve direct hits first, including images inside open or closed shadow roots.
  function findQualifyingImageAtPoint(x, y) {
    const visitedRoots = new Set();
    const wrappers = new Set();

    function searchRoot(root) {
      if (visitedRoots.has(root) || typeof root.elementsFromPoint !== "function") return null;
      visitedRoots.add(root);

      for (const el of root.elementsFromPoint(x, y)) {
        if (el === hostEl || el === document.body || el === document.documentElement) continue;
        if (el.nodeName === "IMG") {
          if (isQualifyingImage(el)) return el;
          continue;
        }

        const shadow = el.openOrClosedShadowRoot || el.shadowRoot;
        if (shadow) {
          const hit = searchRoot(shadow);
          if (hit) return hit;
        }
        wrappers.add(el);
      }
      return null;
    }

    const directHit = searchRoot(document);
    if (directHit) return directHit;

    // Some galleries put an overlay over an image that is itself absent from
    // the hit stack. Inspect nearby descendants with one budget per hit test.
    const maxDepth = 3;
    let remaining = 64;
    const searchedDepth = new Map();

    function searchChildren(parent, depth) {
      if (depth === 0 || (searchedDepth.get(parent) || 0) >= depth) return null;
      searchedDepth.set(parent, depth);
      for (let child = parent.firstElementChild; child && remaining > 0; child = child.nextElementSibling) {
        remaining--;
        if (child.nodeName === "IMG") {
          if (isPointInsideRect(x, y, child.getBoundingClientRect()) && isQualifyingImage(child)) {
            return child;
          }
        } else {
          const match = searchChildren(child, depth - 1);
          if (match) return match;
        }
      }
      return null;
    }

    for (const wrapper of wrappers) {
      if (remaining === 0) break;
      const hit = searchChildren(wrapper, maxDepth);
      if (hit) return hit;
    }

    // CSS backgrounds are supported even when the descendant budget runs out.
    for (const wrapper of wrappers) {
      if (isQualifyingImage(wrapper)) return wrapper;
    }
    return null;
  }

  function isPointInsideRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  // Calculate exact rendered image box accounting for padding, borders, object-fit / background-size, and position
  function getRenderedImageBox(img) {
    const rect = img.getBoundingClientRect();
    const style = window.getComputedStyle(img);
    const isImgTag = img.nodeName === "IMG";

    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;

    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;

    // CSS backgrounds default to padding-box; <img> content uses content-box
    const boxLeft = rect.left + borderLeft + (isImgTag ? padLeft : 0);
    const boxTop = rect.top + borderTop + (isImgTag ? padTop : 0);
    const boxWidth = Math.max(0, rect.width - borderLeft - borderRight - (isImgTag ? padLeft + padRight : 0));
    const boxHeight = Math.max(0, rect.height - borderTop - borderBottom - (isImgTag ? padTop + padBottom : 0));

    const { nw, nh } = getTargetIntrinsicSize(img);

    if (!nw || !nh || boxWidth <= 0 || boxHeight <= 0) {
      return {
        left: boxLeft,
        top: boxTop,
        right: boxLeft + boxWidth,
        bottom: boxTop + boxHeight,
        width: boxWidth,
        height: boxHeight,
        elementRect: rect
      };
    }

    const fit = isImgTag
      ? (style.objectFit || "fill").toLowerCase()
      : (style.backgroundSize || "auto").toLowerCase().trim();

    let renderedWidth = boxWidth;
    let renderedHeight = boxHeight;

    if (fit === "contain" || fit === "scale-down") {
      const scale = Math.min(boxWidth / nw, boxHeight / nh);
      const effectiveScale = fit === "scale-down" ? Math.min(1, scale) : scale;
      renderedWidth = nw * effectiveScale;
      renderedHeight = nh * effectiveScale;
    } else if (fit === "none" || fit === "auto" || fit === "auto auto") {
      renderedWidth = nw;
      renderedHeight = nh;
    } else if (fit === "cover") {
      const scale = Math.max(boxWidth / nw, boxHeight / nh);
      renderedWidth = isImgTag ? boxWidth : nw * scale;
      renderedHeight = isImgTag ? boxHeight : nh * scale;
    } else if (!isImgTag) {
      // Handle explicit background-size (e.g. "100% auto", "800px 600px")
      const sizeParts = fit.split(/\s+/);
      const wToken = sizeParts[0];
      const hToken = sizeParts[1] || "auto";
      let calcW = null;
      let calcH = null;
      if (wToken.endsWith("%")) calcW = boxWidth * (parseFloat(wToken) / 100);
      else if (wToken.endsWith("px")) calcW = parseFloat(wToken);
      if (hToken.endsWith("%")) calcH = boxHeight * (parseFloat(hToken) / 100);
      else if (hToken.endsWith("px")) calcH = parseFloat(hToken);

      if (calcW !== null && calcH !== null) {
        renderedWidth = calcW;
        renderedHeight = calcH;
      } else if (calcW !== null) {
        renderedWidth = calcW;
        renderedHeight = (nh / nw) * calcW;
      } else if (calcH !== null) {
        renderedHeight = calcH;
        renderedWidth = (nw / nh) * calcH;
      }
    }

    // Parse object-position or background-position
    const rawPos = isImgTag ? (style.objectPosition || "50% 50%") : (style.backgroundPosition || "50% 50%");
    const posParts = rawPos.trim().split(/\s+/);
    const offsetX = resolveObjectPositionAxis(posParts[0] || "50%", boxWidth - renderedWidth);
    const offsetY = resolveObjectPositionAxis(posParts[1] || "50%", boxHeight - renderedHeight);

    // Clamp to visible box in case of overflow
    const visibleLeft = Math.max(boxLeft, boxLeft + offsetX);
    const visibleTop = Math.max(boxTop, boxTop + offsetY);
    const visibleRight = Math.min(boxLeft + boxWidth, boxLeft + offsetX + renderedWidth);
    const visibleBottom = Math.min(boxTop + boxHeight, boxTop + offsetY + renderedHeight);

    return {
      left: visibleLeft,
      top: visibleTop,
      right: Math.max(visibleLeft, visibleRight),
      bottom: Math.max(visibleTop, visibleBottom),
      width: renderedWidth,
      height: renderedHeight,
      elementRect: rect
    };
  }

  function resolveObjectPositionAxis(token, freeSpace) {
    if (!token) return freeSpace * 0.5;
    if (token.endsWith("%")) {
      const pct = parseFloat(token);
      return Number.isFinite(pct) ? freeSpace * (pct / 100) : freeSpace * 0.5;
    }
    if (token.endsWith("px")) {
      const px = parseFloat(token);
      return Number.isFinite(px) ? px : 0;
    }
    if (token === "left" || token === "top") return 0;
    if (token === "right" || token === "bottom") return freeSpace;
    return freeSpace * 0.5;
  }

  // Position HUD or Badge anchored to the top-right corner of the rendered image box, clamped to viewport
  function updateHudPosition() {
    rafId = null;
    const activeImg = pinnedImg || hoveredImg;
    if (!activeImg || !containerEl || containerEl.classList.contains("hud-hidden")) {
      return;
    }

    if (!isTargetStillPresent(activeImg, activeTargetUrl)) {
      if (activeImg === pinnedImg) {
        closeExpandedHud();
      } else {
        hoveredImg = null;
        hideAll();
      }
      return;
    }

    const box = getRenderedImageBox(activeImg);
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;

    // Check if the rendered image is completely scrolled out of the viewport
    if (box.bottom < 0 || box.top > vh || box.right < 0 || box.left > vw) {
      containerEl.style.visibility = "hidden";
      return;
    }
    containerEl.style.visibility = "visible";

    // Update live DISPLAYED row if expanded HUD is open
    if (pinnedImg === activeImg && rowElements.displayed) {
      rowElements.displayed.val.textContent = formatDisplayedText(activeImg, box);
    }

    const hudRect = containerEl.getBoundingClientRect();
    const hudW = hudRect.width || (pinnedImg ? 260 : 26);
    const hudH = hudRect.height || (pinnedImg ? 130 : 26);
    const margin = 8;

    let targetLeft = box.right - hudW - margin;
    let targetTop = box.top + margin;

    // Clamp within image bounds when possible, and strictly clamp within viewport
    const minLeft = Math.max(margin, box.left + margin);
    const maxLeft = Math.min(vw - hudW - margin, box.right - hudW - margin);
    if (maxLeft >= minLeft) {
      targetLeft = Math.min(Math.max(targetLeft, minLeft), maxLeft);
    } else {
      targetLeft = Math.min(Math.max(targetLeft, margin), Math.max(margin, vw - hudW - margin));
    }

    const minTop = Math.max(margin, box.top + margin);
    const maxTop = Math.min(vh - hudH - margin, box.bottom - hudH - margin);
    if (maxTop >= minTop) {
      targetTop = Math.min(Math.max(targetTop, minTop), maxTop);
    } else {
      targetTop = Math.min(Math.max(targetTop, margin), Math.max(margin, vh - hudH - margin));
    }

    containerEl.style.transform = `translate3d(${Math.round(targetLeft)}px, ${Math.round(targetTop)}px, 0)`;
  }

  function schedulePositionUpdate() {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(updateHudPosition);
  }

  // Lifecycle State Transitions
  function showHoverBadge(img) {
    if (pinnedImg) return;
    ensureHudDOM();
    if (!containerEl) return;

    hoveredImg = img;
    activeTargetUrl = getTargetUrl(img);
    panelEl.classList.add("hud-hidden");
    badgeBtn.classList.remove("hud-hidden");
    containerEl.classList.remove("hud-hidden");
    startActiveTargetWatchers(img);
    updateHudPosition();
  }

  function openExpandedHud(img) {
    if (!img) return;
    ensureHudDOM();
    if (!containerEl) return;

    isPointerOverBadge = false;
    pinnedImg = img;
    hoveredImg = img;
    activeTargetUrl = getTargetUrl(img);
    badgeBtn.classList.add("hud-hidden");
    panelEl.classList.remove("hud-hidden");
    containerEl.classList.remove("hud-hidden");

    startActiveTargetWatchers(img);
    populateDiagnostics(img);
    updateHudPosition();
  }

  function closeExpandedHud() {
    pinnedImg = null;
    hoveredImg = null;
    activeTargetUrl = "";
    hideAll();
  }

  function hideAll() {
    isPointerOverBadge = false;
    stopActiveTargetWatchers();
    if (!containerEl) return;
    containerEl.classList.add("hud-hidden");
    badgeBtn.classList.add("hud-hidden");
    panelEl.classList.add("hud-hidden");
  }

  // Aspect Ratio & Scaling Helpers
  function computeAspectRatio(w, h) {
    if (!w || !h) return "";
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(w, h);
    const rw = w / divisor;
    const rh = h / divisor;

    if (rw <= 64 && rh <= 64) {
      return `${rw}:${rh}`;
    }

    const ratio = w / h;
    const commonRatios = [
      [16, 9],
      [4, 3],
      [3, 2],
      [21, 9],
      [1, 1],
      [9, 16],
      [3, 4],
      [2, 3],
      [5, 4]
    ];
    for (const [cw, ch] of commonRatios) {
      if (Math.abs(ratio - cw / ch) < 0.015) {
        return `~${cw}:${ch}`;
      }
    }
    return `${ratio.toFixed(2)}:1`;
  }

  function formatIntrinsicText(img) {
    const { nw, nh } = getTargetIntrinsicSize(img);
    if (!nw || !nh) return "Unknown";
    const ar = computeAspectRatio(nw, nh);
    return `${nw} \u00D7 ${nh}${ar ? ` (${ar})` : ""}`;
  }

  function formatDisplayedText(img, box) {
    const rect = box ? box.elementRect : img.getBoundingClientRect();
    const cssW = Math.round(rect.width);
    const cssH = Math.round(rect.height);
    const dpr = window.devicePixelRatio || 1;
    const { nw } = getTargetIntrinsicSize(img);
    const renderedW = box && box.width > 0 ? box.width : rect.width;
    const physicalTargetW = renderedW * dpr;

    let scaleNote = "";
    if (nw > 0 && physicalTargetW > 0) {
      const factor = nw / physicalTargetW;
      if (Math.abs(factor - 1) <= 0.05) {
        scaleNote = ` (1:1 @${Number(dpr.toFixed(2))}x)`;
      } else if (factor > 1) {
        scaleNote = ` (Downscaled ${factor.toFixed(1)}x)`;
      } else {
        scaleNote = ` (Upscaled ${factor.toFixed(2)}x)`;
      }
    }

    return `${cssW} \u00D7 ${cssH} px${scaleNote}`;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  }

  // Picture <source> type lookup
  function getPictureSourceMime(img) {
    const parent = img.parentElement;
    if (!parent || parent.nodeName !== "PICTURE") return null;
    const currentSrc = img.currentSrc || img.src;
    const sources = parent.querySelectorAll("source");
    for (const srcEl of sources) {
      const typeAttr = srcEl.getAttribute("type");
      const srcset = srcEl.getAttribute("srcset") || "";
      if (typeAttr && currentSrc && srcset.includes(currentSrc)) {
        return typeAttr.split(";")[0].trim().toLowerCase();
      }
    }
    for (const srcEl of sources) {
      const typeAttr = srcEl.getAttribute("type");
      if (typeAttr && srcEl.media && window.matchMedia(srcEl.media).matches) {
        return typeAttr.split(";")[0].trim().toLowerCase();
      }
    }
    return null;
  }

  // Magic Byte Container & Bit-Depth / Subsampling / Animation Analyzer
  function analyzeHeaderBytes(bytes, mimeHint, urlHint) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const len = b.length;

    let format = null;
    let details = [];
    let inferredMime = mimeHint || null;

    const ascii = (start, count) => {
      let s = "";
      for (let i = start; i < Math.min(len, start + count); i++) {
        s += String.fromCharCode(b[i]);
      }
      return s;
    };

    // 1. PNG / APNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      len >= 26 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4E &&
      b[3] === 0x47
    ) {
      format = "PNG";
      inferredMime = inferredMime || "image/png";
      const bitDepth = b[24];
      const colorType = b[25];
      const interlace = b[28];

      const colorMap = {
        0: "Grayscale",
        2: "RGB",
        3: "Indexed",
        4: "Grayscale+Alpha",
        6: "RGBA"
      };
      if (bitDepth) details.push(`${bitDepth}-bit ${colorMap[colorType] || ""}`.trim());
      if (interlace === 1) details.push("Adam7 Interlaced");

      // Scan for acTL chunk before IDAT to identify APNG
      const fullAscii = ascii(0, len);
      const actlIdx = fullAscii.indexOf("acTL");
      const idatIdx = fullAscii.indexOf("IDAT");
      if (actlIdx !== -1 && (idatIdx === -1 || actlIdx < idatIdx)) {
        format = "APNG";
        inferredMime = "image/apng";
        details.push("Animated");
      }
    }
    // 2. JPEG: FF D8 FF
    else if (len >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
      format = "JPEG";
      inferredMime = inferredMime || "image/jpeg";
      let offset = 2;
      while (offset + 4 < len) {
        if (b[offset] !== 0xFF) {
          offset++;
          continue;
        }
        const marker = b[offset + 1];
        if (marker === 0xFF) {
          offset++;
          continue;
        }
        if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
          offset += 2;
          continue;
        }
        const segLen = (b[offset + 2] << 8) | b[offset + 3];
        if (segLen < 2) break;

        // SOF0 (Baseline) or SOF2 (Progressive)
        if (marker === 0xC0 || marker === 0xC2) {
          const mode = marker === 0xC2 ? "Progressive" : "Baseline";
          details.push(mode);
          if (offset + 9 < len) {
            const precision = b[offset + 4];
            const components = b[offset + 9];
            details.push(`${precision}-bit`);
            if (components === 3 && offset + 18 <= len) {
              const s1 = b[offset + 11];
              const s2 = b[offset + 14];
              const s3 = b[offset + 17];
              const h1 = s1 >> 4, v1 = s1 & 0x0F;
              const h2 = s2 >> 4, v2 = s2 & 0x0F;
              const h3 = s3 >> 4, v3 = s3 & 0x0F;
              if (h2 === 1 && v2 === 1 && h3 === 1 && v3 === 1) {
                if (h1 === 2 && v1 === 2) details.push("4:2:0");
                else if (h1 === 2 && v1 === 1) details.push("4:2:2");
                else if (h1 === 1 && v1 === 1) details.push("4:4:4");
              }
            } else if (components === 1) {
              details.push("Grayscale");
            }
          }
          break;
        }
        offset += 2 + segLen;
      }
    }
    // 3. WebP: RIFF....WEBP
    else if (len >= 16 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
      inferredMime = inferredMime || "image/webp";
      const chunk = ascii(12, 4);
      if (chunk === "VP8 ") {
        format = "WebP (Lossy)";
        details.push("8-bit YUV 4:2:0");
      } else if (chunk === "VP8L") {
        format = "WebP (Lossless)";
        details.push("8-bit RGBA");
      } else if (chunk === "VP8X" && len >= 30) {
        const flags = b[20];
        const hasAlpha = Boolean(flags & 0x10);
        const isAnimated = Boolean(flags & 0x02);
        const subChunks = ascii(30, len - 30);
        if (subChunks.includes("VP8L") && !subChunks.includes("VP8 ")) {
          format = "WebP (Lossless)";
        } else if (subChunks.includes("VP8 ")) {
          format = "WebP (Lossy)";
        } else {
          format = "WebP (Lossy)";
        }
        if (isAnimated) details.push("Animated");
        if (hasAlpha) details.push("Alpha");
      } else {
        format = "WebP (Lossy)";
      }
    }
    // 4. AVIF: ....ftypavif / avis / mif1
    else if (len >= 12 && ascii(4, 4) === "ftyp") {
      const brand = ascii(8, 4);
      const headerStr = ascii(8, Math.min(len - 8, 64));
      if (brand === "avif" || brand === "avis" || headerStr.includes("avif") || headerStr.includes("avis")) {
        format = "AVIF";
        inferredMime = inferredMime || "image/avif";
        if (brand === "avis" || headerStr.includes("avis")) {
          details.push("Animated Sequence");
        }
        // Check av1C box for bit depth / chroma subsampling if present in first 512 bytes
        const fullStr = ascii(0, len);
        const av1cPos = fullStr.indexOf("av1C");
        if (av1cPos !== -1 && av1cPos + 8 < len) {
          const byte2 = b[av1cPos + 6];
          const byte3 = b[av1cPos + 7];
          const highBitdepth = Boolean(byte2 & 0x40);
          const twelveBit = Boolean(byte2 & 0x20);
          const monochrome = Boolean(byte2 & 0x10);
          const subX = Boolean(byte3 & 0x80);
          const subY = Boolean(byte3 & 0x40);

          const depth = highBitdepth ? (twelveBit ? 12 : 10) : 8;
          details.push(`${depth}-bit`);
          if (monochrome) {
            details.push("Monochrome");
          } else if (!subX && !subY) {
            details.push("4:4:4");
          } else if (subX && !subY) {
            details.push("4:2:2");
          } else if (subX && subY) {
            details.push("4:2:0");
          }
        }
      }
    }
    // 5. JPEG XL: FF 0A or 00 00 00 0C 4A 58 4C 20 0D 0A 87 0A
    else if (
      (len >= 2 && b[0] === 0xFF && b[1] === 0x0A) ||
      (len >= 12 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x00 && b[3] === 0x0C && ascii(4, 4) === "JXL ")
    ) {
      format = "JPEG XL";
      inferredMime = inferredMime || "image/jxl";
      details.push(b[0] === 0xFF ? "Codestream" : "ISOBMFF Container");
    }
    // 6. GIF: GIF87a / GIF89a
    else if (len >= 13 && (ascii(0, 6) === "GIF89a" || ascii(0, 6) === "GIF87a")) {
      format = "GIF";
      inferredMime = inferredMime || "image/gif";
      const packed = b[10];
      const bpp = (packed & 0x07) + 1;
      details.push(`${bpp}-bit Palette`);
      // Count GCE (21 F9 04) blocks to detect animation
      let gceCount = 0;
      for (let i = 0; i < len - 3; i++) {
        if (b[i] === 0x21 && b[i + 1] === 0xF9 && b[i + 2] === 0x04) {
          gceCount++;
        }
      }
      if (gceCount > 1) details.push("Animated");
    }
    // 7. BMP: 42 4D ("BM")
    else if (len >= 29 && b[0] === 0x42 && b[1] === 0x4D) {
      format = "BMP";
      inferredMime = inferredMime || "image/bmp";
      const bpp = b[28] | (b[29] << 8);
      if (bpp) details.push(`${bpp}-bit`);
    }
    // 8. ICO: 00 00 01 00
    else if (len >= 6 && b[0] === 0x00 && b[1] === 0x00 && (b[2] === 0x01 || b[2] === 0x02) && b[3] === 0x00) {
      format = "ICO";
      inferredMime = inferredMime || "image/x-icon";
      const count = b[4] | (b[5] << 8);
      if (count > 0) details.push(`${count} icon${count > 1 ? "s" : ""}`);
    }
    // 9. SVG (text/xml or <svg)
    else if (len >= 4) {
      const textHead = ascii(0, Math.min(len, 256)).trim().toLowerCase();
      if (textHead.startsWith("<svg") || textHead.includes("<svg") || inferredMime === "image/svg+xml") {
        format = "SVG";
        inferredMime = "image/svg+xml";
        details.push("Vector XML");
      }
    }

    // Fallback to MIME or URL extension if header bytes were unavailable
    if (!format) {
      format = resolveFormatFromMimeOrUrl(inferredMime, urlHint);
    }

    const mimeLabel = inferredMime || mimeFromFormat(format) || "unknown";
    const detailsText = details.length > 0
      ? `${details.join(" \u00B7 ")} (${mimeLabel})`
      : mimeLabel;

    return { format, detailsText, mime: mimeLabel };
  }

  function resolveFormatFromMimeOrUrl(mime, url) {
    const m = (mime || "").toLowerCase();
    if (m.includes("avif")) return "AVIF";
    if (m.includes("webp")) return "WebP (Lossy)";
    if (m.includes("jxl")) return "JPEG XL";
    if (m.includes("jpeg") || m.includes("jpg")) return "JPEG";
    if (m.includes("apng")) return "APNG";
    if (m.includes("png")) return "PNG";
    if (m.includes("gif")) return "GIF";
    if (m.includes("svg")) return "SVG";
    if (m.includes("bmp")) return "BMP";
    if (m.includes("icon") || m.includes("ico")) return "ICO";

    if (url) {
      try {
        const pathname = new URL(url, location.href).pathname.toLowerCase();
        if (pathname.endsWith(".avif")) return "AVIF";
        if (pathname.endsWith(".webp")) return "WebP (Lossy)";
        if (pathname.endsWith(".jxl")) return "JPEG XL";
        if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "JPEG";
        if (pathname.endsWith(".apng")) return "APNG";
        if (pathname.endsWith(".png")) return "PNG";
        if (pathname.endsWith(".gif")) return "GIF";
        if (pathname.endsWith(".svg")) return "SVG";
        if (pathname.endsWith(".bmp")) return "BMP";
        if (pathname.endsWith(".ico")) return "ICO";
      } catch (e) {}
    }
    return "Unknown";
  }

  function mimeFromFormat(format) {
    const map = {
      "AVIF": "image/avif",
      "WebP (Lossy)": "image/webp",
      "WebP (Lossless)": "image/webp",
      "JPEG XL": "image/jxl",
      "JPEG": "image/jpeg",
      "PNG": "image/png",
      "APNG": "image/apng",
      "GIF": "image/gif",
      "SVG": "image/svg+xml",
      "BMP": "image/bmp",
      "ICO": "image/x-icon"
    };
    return map[format] || null;
  }

  function extensionFromFormat(format) {
    const map = {
      "AVIF": ".avif",
      "WebP (Lossy)": ".webp",
      "WebP (Lossless)": ".webp",
      "JPEG XL": ".jxl",
      "JPEG": ".jpg",
      "PNG": ".png",
      "APNG": ".apng",
      "GIF": ".gif",
      "SVG": ".svg",
      "BMP": ".bmp",
      "ICO": ".ico"
    };
    return map[format] || "";
  }

  function buildDownloadFilename(url, format) {
    const ext = extensionFromFormat(format);
    if (!url || url.startsWith("data:")) {
      return `image${ext || ".png"}`;
    }
    try {
      const parsed = new URL(url, location.href);
      const rawName = decodeURIComponent(parsed.pathname.split("/").pop() || "").trim();
      const sanitized = rawName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
      if (sanitized) {
        if (/\.[a-z0-9]{2,5}$/i.test(sanitized)) {
          return sanitized;
        }
        return `${sanitized}${ext || ".img"}`;
      }
    } catch (e) {}
    return `image${ext || ".img"}`;
  }

  // Extract file size from PerformanceResourceTiming
  function getPerformanceTimingSize(url) {
    if (!url || url.startsWith("data:") || typeof performance.getEntriesByName !== "function") {
      return null;
    }
    const entries = performance.getEntriesByName(url, "resource");
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.encodedBodySize && entry.encodedBodySize > 0) {
        return entry.encodedBodySize;
      }
      if (entry.transferSize && entry.transferSize > 0) {
        return entry.transferSize;
      }
      if (entry.decodedBodySize && entry.decodedBodySize > 0) {
        return entry.decodedBodySize;
      }
    }
    return null;
  }

  // Cache-first local magic-byte slice (first 512 bytes covers 64-byte headers + JPEG SOF / PNG acTL)
  async function fetchCacheFirstHeaderBytes(url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(url, {
        method: "GET",
        cache: "force-cache",
        credentials: "same-origin",
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) return null;
      const ct = res.headers.get("content-type");
      const cl = res.headers.get("content-length");
      let byteLength = cl ? parseInt(cl, 10) : null;
      let headerBytes = null;

      if (res.body) {
        const reader = res.body.getReader();
        const { value } = await reader.read();
        if (value && value.byteLength > 0) {
          headerBytes = value.slice(0, 512);
        }
        await reader.cancel().catch(() => {});
      } else {
        const buf = await res.arrayBuffer();
        if (!byteLength && buf.byteLength > 0) byteLength = buf.byteLength;
        headerBytes = new Uint8Array(buf.slice(0, 512));
      }

      return {
        contentType: ct ? ct.split(";")[0].trim().toLowerCase() : null,
        contentLength: Number.isFinite(byteLength) && byteLength > 0 ? byteLength : null,
        headerBytes
      };
    } catch (e) {
      return null;
    }
  }

  // Decode data: URI directly
  function parseDataUri(dataUrl) {
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx === -1) return null;
    const meta = dataUrl.slice(5, commaIdx);
    const dataPart = dataUrl.slice(commaIdx + 1);
    const isBase64 = meta.includes(";base64");
    const mime = meta.split(";")[0].trim().toLowerCase() || "image/png";

    let byteSize = 0;
    let headerBytes = new Uint8Array(0);
    try {
      if (isBase64) {
        const clean = dataPart.replace(/\s+/g, "");
        byteSize = Math.floor((clean.length * 3) / 4);
        const sliceStr = atob(clean.slice(0, 700));
        headerBytes = new Uint8Array(sliceStr.length);
        for (let i = 0; i < sliceStr.length; i++) {
          headerBytes[i] = sliceStr.charCodeAt(i);
        }
      } else {
        const decoded = decodeURIComponent(dataPart);
        byteSize = new Blob([decoded]).size;
        const enc = new TextEncoder().encode(decoded.slice(0, 512));
        headerBytes = enc;
      }
    } catch (e) {}

    return { contentType: mime, contentLength: byteSize, headerBytes };
  }

  async function resolveImageDiagnostics(img) {
    const url = getTargetUrl(img);
    if (!url) {
      return {
        format: "Unknown",
        byteSize: null,
        detailsText: "No source URL"
      };
    }

    if (diagnosticsCache.has(url)) {
      return diagnosticsCache.get(url);
    }

    const pictureMime = getPictureSourceMime(img);
    let contentType = pictureMime || null;
    let byteSize = getPerformanceTimingSize(url);
    let headerBytes = null;

    if (url.startsWith("data:")) {
      const parsed = parseDataUri(url);
      if (parsed) {
        contentType = parsed.contentType || contentType;
        byteSize = parsed.contentLength || byteSize;
        headerBytes = parsed.headerBytes;
      }
    } else {
      // 1. Query background webRequest passive header cache first
      try {
        const bgMeta = await browser.runtime.sendMessage({
          type: "GET_IMAGE_METADATA",
          url,
          needBytes: false
        });
        if (bgMeta) {
          contentType = bgMeta.contentType || contentType;
          if (!byteSize && bgMeta.contentLength) {
            byteSize = bgMeta.contentLength;
          }
        }
      } catch (e) {}

      // 2. Try content-script force-cache slice for magic bytes
      const localProbe = await fetchCacheFirstHeaderBytes(url);
      if (localProbe) {
        contentType = localProbe.contentType || contentType;
        if (!byteSize && localProbe.contentLength) {
          byteSize = localProbe.contentLength;
        }
        headerBytes = localProbe.headerBytes;
      }

      // 3. If CORS blocked content-script fetch, ask privileged background script for magic bytes & size
      if (!headerBytes || !byteSize) {
        try {
          const bgProbe = await browser.runtime.sendMessage({
            type: "GET_IMAGE_METADATA",
            url,
            needBytes: true
          });
          if (bgProbe) {
            contentType = bgProbe.contentType || contentType;
            if (!byteSize && bgProbe.contentLength) {
              byteSize = bgProbe.contentLength;
            }
            if (!headerBytes && bgProbe.headerBytes) {
              headerBytes = new Uint8Array(bgProbe.headerBytes);
            }
          }
        } catch (e) {}
      }
    }

    const analyzed = analyzeHeaderBytes(headerBytes, contentType, url);
    const result = {
      format: analyzed.format,
      byteSize,
      detailsText: analyzed.detailsText
    };

    if (result.format !== "Unknown" && result.byteSize) {
      diagnosticsCache.set(url, result);
    }
    return result;
  }

  async function populateDiagnostics(img) {
    const reqId = ++diagnosticRequestId;
    const box = getRenderedImageBox(img);
    const initialUrl = getTargetUrl(img);

    if (downloadBtn) {
      downloadBtn.href = initialUrl || "#";
      downloadBtn.download = buildDownloadFilename(initialUrl, null);
    }

    rowElements.intrinsic.val.textContent = formatIntrinsicText(img);
    rowElements.displayed.val.textContent = formatDisplayedText(img, box);
    rowElements.format.val.textContent = "Inspecting\u2026";
    rowElements.size.val.textContent = "Inspecting\u2026";
    rowElements.details.val.textContent = "Inspecting\u2026";

    const diag = await resolveImageDiagnostics(img);
    if (reqId !== diagnosticRequestId || pinnedImg !== img) return;

    if (downloadBtn) {
      downloadBtn.href = initialUrl || "#";
      downloadBtn.download = buildDownloadFilename(initialUrl, diag.format);
    }

    rowElements.intrinsic.val.textContent = formatIntrinsicText(img);
    rowElements.displayed.val.textContent = formatDisplayedText(img, getRenderedImageBox(img));
    rowElements.format.val.textContent = diag.format;
    rowElements.details.val.textContent = diag.detailsText;

    const { nw, nh } = getTargetIntrinsicSize(img);
    const totalPixels = nw * nh;
    const formattedSize = formatBytes(diag.byteSize);

    if (formattedSize && totalPixels > 0) {
      const bpp = (diag.byteSize * 8) / totalPixels;
      rowElements.size.val.textContent = `${formattedSize} (${bpp.toFixed(2)} bpp)`;
    } else if (formattedSize) {
      rowElements.size.val.textContent = formattedSize;
    } else {
      rowElements.size.val.textContent = "Unavailable";
    }

    schedulePositionUpdate();
  }

  async function triggerImageDownload(img) {
    if (!img) return;
    const url = getTargetUrl(img);
    if (!url) return;

    const cachedDiag = diagnosticsCache.get(url);
    const filename = buildDownloadFilename(url, cachedDiag ? cachedDiag.format : null);

    const triggerAnchor = (href, dlName, newTab = false) => {
      const a = document.createElement("a");
      a.href = href;
      if (dlName) a.download = dlName;
      if (newTab) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    if (url.startsWith("data:")) {
      triggerAnchor(url, filename);
      return;
    }

    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit", cache: "force-cache" });
      if (!response.ok) throw new Error("Non-200 response");
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      triggerAnchor(blobUrl, filename);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (e) {
      // Fallback if CDN omits Access-Control-Allow-Origin headers
      triggerAnchor(url, filename, true);
    }
  }

  function scheduleHoverHitTest(x, y) {
    if (pinnedImg || !settings.showHoverButton || isPointerOverBadge) return;
    hoverX = x;
    hoverY = y;
    if (hoverFrameId !== null) return;

    hoverFrameId = window.requestAnimationFrame(() => {
      hoverFrameId = null;
      if (pinnedImg || !settings.showHoverButton || isPointerOverBadge) return;

      const candidate = findQualifyingImageAtPoint(hoverX, hoverY);
      if (candidate && candidate !== hoveredImg) {
        showHoverBadge(candidate);
      } else if (candidate) {
        schedulePositionUpdate();
      } else if (hoveredImg) {
        hoveredImg = null;
        hideAll();
      }
    });
  }

  window.addEventListener("mousemove", (e) => {
    scheduleHoverHitTest(e.clientX, e.clientY);
  }, { capture: true, passive: true });

  window.addEventListener("contextmenu", (e) => {
    lastContextPoint = { x: e.clientX, y: e.clientY, time: Date.now() };
    lastContextCandidate = findQualifyingImageAtPoint(e.clientX, e.clientY);
  }, { capture: true, passive: true });

  window.addEventListener("scroll", schedulePositionUpdate, { capture: true, passive: true });
  window.addEventListener("resize", schedulePositionUpdate, { capture: true, passive: true });
  window.addEventListener("hashchange", schedulePositionUpdate, { capture: true, passive: true });
  window.addEventListener("popstate", schedulePositionUpdate, { capture: true, passive: true });
  window.addEventListener("transitionend", schedulePositionUpdate, { capture: true, passive: true });
  window.addEventListener("animationend", schedulePositionUpdate, { capture: true, passive: true });
  window.addEventListener("keydown", () => {
    if (pinnedImg || hoveredImg) {
      setTimeout(schedulePositionUpdate, 30);
    }
  }, { capture: true, passive: true });

  // Resolve target image from both menus.getTargetElement(id) and elementsFromPoint overlay piercing
  function resolveContextTargetImage(targetElementId) {
    if (lastContextCandidate && isQualifyingImage(lastContextCandidate)) {
      return lastContextCandidate;
    }

    if (targetElementId !== null && targetElementId !== undefined && browser.menus && typeof browser.menus.getTargetElement === "function") {
      const rawTarget = browser.menus.getTargetElement(targetElementId);
      if (rawTarget) {
        if (isQualifyingImage(rawTarget)) {
          return rawTarget;
        }
        const nestedImg = rawTarget.querySelector && rawTarget.querySelector("img");
        if (nestedImg && isQualifyingImage(nestedImg)) {
          return nestedImg;
        }
        const rect = rawTarget.getBoundingClientRect && rawTarget.getBoundingClientRect();
        if (rect) {
          const cx = lastContextPoint.x || (rect.left + rect.width / 2);
          const cy = lastContextPoint.y || (rect.top + rect.height / 2);
          const pierced = findQualifyingImageAtPoint(cx, cy);
          if (pierced) return pierced;
        }
      }
    }

    return null;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") return false;

    if (message.type === "CHECK_CONTEXT_TARGET") {
      const img = resolveContextTargetImage(message.targetElementId);
      return Promise.resolve({ qualifies: Boolean(img) });
    }

    if (message.type === "OPEN_HUD_FROM_CONTEXT") {
      const img = resolveContextTargetImage(message.targetElementId);
      if (img) {
        openExpandedHud(img);
      }
      return Promise.resolve({ opened: Boolean(img) });
    }

    return false;
  });
  watchHudSettings(DEFAULT_SETTINGS, nextSettings => {
    settings = nextSettings;
    if (containerEl) applyHudAppearance(containerEl, settings);
    revalidateActiveImages();
  });
})();