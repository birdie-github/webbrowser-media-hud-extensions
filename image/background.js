"use strict";

const DEFAULT_SETTINGS = imageActivationDefaults;

const MENU_ID = "show-image-info-hud";
const MAX_CACHE_ENTRIES = 2000;
const headerCache = new Map();

let currentSettings = { ...DEFAULT_SETTINGS };

function setCacheEntry(url, data) {
  if (!url || url.startsWith("data:")) return;
  if (headerCache.has(url)) {
    headerCache.delete(url);
  } else if (headerCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = headerCache.keys().next().value;
    headerCache.delete(oldestKey);
  }
  headerCache.set(url, data);
}

function getCacheEntry(url) {
  if (!url || !headerCache.has(url)) return null;
  const val = headerCache.get(url);
  headerCache.delete(url);
  headerCache.set(url, val);
  return val;
}

// Passive HTTP Header Capture for exact MIME type & Content-Length
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.statusCode < 200 || details.statusCode >= 400) return;
    const headers = details.responseHeaders || [];
    let contentType = null;
    let contentLength = null;

    for (const h of headers) {
      const name = h.name.toLowerCase();
      if (name === "content-type" && h.value) {
        contentType = h.value.split(";")[0].trim().toLowerCase();
      } else if (name === "content-length" && h.value) {
        const parsed = parseInt(h.value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          contentLength = parsed;
        }
      }
    }

    if (contentType || contentLength !== null) {
      const existing = getCacheEntry(details.url) || {};
      setCacheEntry(details.url, {
        contentType: contentType || existing.contentType || null,
        contentLength: contentLength !== null ? contentLength : (existing.contentLength ?? null),
        timestamp: Date.now()
      });
    }
  },
  { urls: ["<all_urls>"], types: ["image", "imageset"] },
  ["responseHeaders"]
);

// Context Menu Management
let menuCreated = false;

async function syncContextMenu() {
  if (currentSettings.enableContextMenu && !menuCreated) {
    try {
      await browser.menus.removeAll();
      browser.menus.create({
        id: MENU_ID,
        title: "Show Image Info HUD",
        contexts: ["all"]
      });
      menuCreated = true;
    } catch (e) {
      // Ignore duplicate menu errors
    }
  } else if (!currentSettings.enableContextMenu && menuCreated) {
    try {
      await browser.menus.removeAll();
      menuCreated = false;
    } catch (e) {}
  }
}

if (browser.menus && browser.menus.onShown) {
  browser.menus.onShown.addListener(async (info, tab) => {
    if (!currentSettings.enableContextMenu || !menuCreated || !tab || !tab.id) {
      return;
    }

    let qualifies = false;
    try {
      const response = await browser.tabs.sendMessage(
        tab.id,
        {
          type: "CHECK_CONTEXT_TARGET",
          targetElementId: info.targetElementId ?? null
        },
        { frameId: info.frameId || 0 }
      );
      qualifies = Boolean(response && response.qualifies);
    } catch (e) {
      qualifies = false;
    }

    try {
      await browser.menus.update(MENU_ID, {
        visible: qualifies,
        enabled: qualifies
      });
      await browser.menus.refresh();
    } catch (e) {}
  });

  browser.menus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab || !tab.id) return;
    browser.tabs.sendMessage(
      tab.id,
      {
        type: "OPEN_HUD_FROM_CONTEXT",
        targetElementId: info.targetElementId ?? null
      },
      { frameId: info.frameId || 0 }
    ).catch(() => {});
  });
}

// Privileged Fallback Probe for Magic Bytes & Header Inspection
async function probeUrlInBackground(url) {
  const cached = getCacheEntry(url) || {};
  let contentType = cached.contentType || null;
  let contentLength = cached.contentLength ?? null;
  let headerBytes = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(url, {
      method: "GET",
      cache: "force-cache",
      credentials: "omit",
      signal: controller.signal
    });

    if (!contentType) {
      const ct = response.headers.get("content-type");
      if (ct) contentType = ct.split(";")[0].trim().toLowerCase();
    }
    if (contentLength === null) {
      const cl = response.headers.get("content-length");
      if (cl) {
        const parsed = parseInt(cl, 10);
        if (Number.isFinite(parsed) && parsed > 0) contentLength = parsed;
      }
    }

    if (response.body) {
      const reader = response.body.getReader();
      const { value } = await reader.read();
      if (value && value.byteLength > 0) {
        headerBytes = Array.from(value.slice(0, 512));
      }
      await reader.cancel().catch(() => {});
    } else {
      const buf = await response.arrayBuffer();
      if (contentLength === null && buf.byteLength > 0) {
        contentLength = buf.byteLength;
      }
      headerBytes = Array.from(new Uint8Array(buf.slice(0, 512)));
    }

    clearTimeout(timeoutId);

    if (contentType || contentLength !== null) {
      setCacheEntry(url, { contentType, contentLength, timestamp: Date.now() });
    }
  } catch (e) {
    // Ignore network/abort errors; return whatever was cached
  }

  return { contentType, contentLength, headerBytes };
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "GET_IMAGE_METADATA") {
    const url = message.url;
    const cached = getCacheEntry(url);
    if (cached && !message.needBytes) {
      return Promise.resolve({
        contentType: cached.contentType,
        contentLength: cached.contentLength,
        headerBytes: null
      });
    }
    return probeUrlInBackground(url);
  }
  return false;
});

watchHudSettings(DEFAULT_SETTINGS, settings => {
  currentSettings = settings;
  syncContextMenu();
});
