"use strict";

const DEFAULT_SETTINGS = {
  minWidth: 350,
  minHeight: 350,
  showHoverButton: true,
  enableContextMenu: true
};

const minWidthInput = document.getElementById("minWidth");
const minHeightInput = document.getElementById("minHeight");
const showHoverCheckbox = document.getElementById("showHoverButton");
const enableContextCheckbox = document.getElementById("enableContextMenu");

function enforceCheckboxConstraint() {
  // Ensure at least one checkbox is always checked
  if (!showHoverCheckbox.checked && !enableContextCheckbox.checked) {
    showHoverCheckbox.checked = true;
  }

  // If only one checkbox is checked, disable it so it cannot be unchecked
  if (showHoverCheckbox.checked && !enableContextCheckbox.checked) {
    showHoverCheckbox.disabled = true;
    enableContextCheckbox.disabled = false;
  } else if (!showHoverCheckbox.checked && enableContextCheckbox.checked) {
    enableContextCheckbox.disabled = true;
    showHoverCheckbox.disabled = false;
  } else {
    showHoverCheckbox.disabled = false;
    enableContextCheckbox.disabled = false;
  }
}

async function restoreOptions() {
  try {
    const stored = await browser.storage.local.get(DEFAULT_SETTINGS);
    minWidthInput.value = Number.isFinite(stored.minWidth) ? stored.minWidth : DEFAULT_SETTINGS.minWidth;
    minHeightInput.value = Number.isFinite(stored.minHeight) ? stored.minHeight : DEFAULT_SETTINGS.minHeight;
    showHoverCheckbox.checked = Boolean(stored.showHoverButton);
    enableContextCheckbox.checked = Boolean(stored.enableContextMenu);
    enforceCheckboxConstraint();
  } catch (err) {
    console.error("Failed to restore options:", err);
  }
}

async function saveOptions() {
  enforceCheckboxConstraint();

  const minWidth = Math.max(1, parseInt(minWidthInput.value, 10) || DEFAULT_SETTINGS.minWidth);
  const minHeight = Math.max(1, parseInt(minHeightInput.value, 10) || DEFAULT_SETTINGS.minHeight);

  await browser.storage.local.set({
    minWidth,
    minHeight,
    showHoverButton: showHoverCheckbox.checked,
    enableContextMenu: enableContextCheckbox.checked
  });
}

minWidthInput.addEventListener("change", saveOptions);
minWidthInput.addEventListener("input", saveOptions);
minHeightInput.addEventListener("change", saveOptions);
minHeightInput.addEventListener("input", saveOptions);
showHoverCheckbox.addEventListener("change", saveOptions);
enableContextCheckbox.addEventListener("change", saveOptions);

document.addEventListener("DOMContentLoaded", restoreOptions);