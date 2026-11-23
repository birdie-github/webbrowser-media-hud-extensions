"use strict";

function createHudHost(extensionCSS) {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = hudInfoButtonCSS + `
    .hud-panel {
      background: color-mix(in srgb, var(--hud-background, #0f1117) var(--hud-opacity, 88%), transparent);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-radius: 6px;
    }
    .hud-label { color: #94a3b8; font-weight: 600; }
    .hud-value { color: var(--hud-text, #38bdf8); text-align: right; }
  ` + extensionCSS;
  shadow.appendChild(style);
  return { host, shadow };
}

function createHudButton(className, text, title, activate) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    activate();
  }, true);
  return button;
}

function createHudFields(labelText) {
  const label = document.createElement("span");
  label.className = "hud-label";
  label.textContent = labelText;
  const val = document.createElement("span");
  val.className = "hud-value";
  return { label, val };
}
