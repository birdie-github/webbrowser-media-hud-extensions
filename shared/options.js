"use strict";

const manifest = browser.runtime.getManifest();
const isImage = manifest.browser_specific_settings.gecko.id === "image-format-hud@birdie-github";
const defaults = { ...hudDefaults, ...(isImage ? imageActivationDefaults : videoActivationDefaults) };
const fields = Object.fromEntries(Object.keys(defaults).map(key => [key, document.getElementById(key)]));
const status = document.getElementById("saveStatus");

document.title = `${manifest.name} Preferences`;
document.getElementById(isImage ? "imageActivation" : "videoActivation").hidden = false;

function updateActivationControls() {
  if (!isImage) return;
  fields.showHoverButton.disabled = !fields.enableContextMenu.checked;
  fields.enableContextMenu.disabled = !fields.showHoverButton.checked;
}

async function initializeOptions() {
  const settings = normalizeHudSettings(defaults, await browser.storage.local.get(defaults));
  for (const [key, input] of Object.entries(fields)) {
    if (input.type === "checkbox") input.checked = settings[key];
    else input.value = settings[key];

    input.addEventListener("change", async () => {
      if (!input.validity.valid || input.value === "") return;
      const value = input.type === "checkbox" ? input.checked
        : input.type === "number" ? input.valueAsNumber : input.value;
      updateActivationControls();
      try {
        await browser.storage.local.set({ [key]: value });
        status.textContent = "";
      } catch (error) {
        status.textContent = "Could not save preference.";
        console.error(error);
      }
    });
  }
  updateActivationControls();
}

initializeOptions().catch(error => {
  status.textContent = "Could not load preferences.";
  console.error(error);
});
