"use strict";

const hudDefaults = {
  minWidth: 320,
  minHeight: 240,
  hudPosition: "top-right",
  fontSize: 11.5,
  panelOpacity: 88,
  panelBackground: "#0f1117",
  panelText: "#38bdf8"
};

const imageActivationDefaults = { imageButtonMode: "hover", enableContextMenu: true };
const videoActivationDefaults = { showInfoButton: false };

function normalizeHudSettings(defaults, values) {
  const settings = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = values[key];
    if (key === "imageButtonMode") {
      settings[key] = ["hover", "auto", "never"].includes(value)
        ? value : values.showHoverButton === false ? "never" : "hover";
    } else if (key === "hudPosition") {
      if (["top-right", "bottom-right", "top-left", "bottom-left"].includes(value)) {
        settings[key] = value;
      }
    } else if (typeof fallback === "boolean" && typeof value === "boolean") {
      settings[key] = value;
    } else if (typeof fallback === "string" && typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
      settings[key] = value;
    } else if (Number.isFinite(value)) {
      if ((key === "minWidth" || key === "minHeight") && Number.isInteger(value) && value >= 1) {
        settings[key] = value;
      } else if (key === "fontSize" && value >= 8 && value <= 24) {
        settings[key] = value;
      } else if (key === "panelOpacity" && value >= 0 && value <= 100) {
        settings[key] = value;
      }
    }
  }
  if (settings.imageButtonMode === "never") settings.enableContextMenu = true;
  return settings;
}

async function readHudSettings(defaults) {
  const keys = Object.keys(defaults);
  if ("imageButtonMode" in defaults) keys.push("showHoverButton");
  return normalizeHudSettings(defaults, await browser.storage.local.get(keys));
}

function watchHudSettings(defaults, onSettings) {
  let revision = 0;
  async function reload() {
    const request = ++revision;
    try {
      const stored = await readHudSettings(defaults);
      if (request === revision) onSettings(stored);
    } catch (error) {
      console.error("Could not load HUD preferences", error);
    }
  }
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && Object.keys(defaults).some(key => key in changes)) reload();
  });
  return reload();
}
