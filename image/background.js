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
    if (details.statusCode !== 200) return;
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

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "GET_IMAGE_METADATA") return false;
  const { url, needBytes } = message;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;

  if (!needBytes) return Promise.resolve(getCacheEntry(url));
  return fetchImagePrefix(url, "omit", 3500).then(probe => {
    if (probe?.headerBytes) probe.headerBytes = Array.from(probe.headerBytes);
    return probe;
  });
});

watchHudSettings(DEFAULT_SETTINGS, settings => {
  currentSettings = settings;
  syncContextMenu();
});
