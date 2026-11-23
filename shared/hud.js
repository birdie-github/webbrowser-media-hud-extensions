"use strict";

function createHudHost() {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = hudBaseCSS;
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

function createHudBadge(title, activate) {
  return createHudButton("info-badge", "ℹ️", title, activate);
}

function createHudPanel(fields, onClose, action) {
  const panel = document.createElement("div");
  panel.className = "hud-panel hud-typography";
  panel.addEventListener("click", event => event.stopPropagation());

  const header = document.createElement("div");
  header.className = "hud-header";
  const title = document.createElement("span");
  title.className = "hud-title";
  title.textContent = "Info";
  const close = createHudButton("hud-icon-btn", "×", "Close HUD", onClose);
  header.appendChild(title);
  if (action) header.appendChild(action);
  header.appendChild(close);

  const grid = document.createElement("div");
  grid.className = "hud-grid";
  const rows = {};
  for (const [key, text] of Object.entries(fields)) {
    const row = document.createElement("div");
    row.className = "hud-row";
    const label = document.createElement("span");
    label.className = "hud-label";
    label.textContent = text;
    const val = document.createElement("span");
    val.className = "hud-value";
    val.textContent = "…";
    row.append(label, val);
    grid.appendChild(row);
    rows[key] = { row, val };
  }
  panel.append(header, grid);
  return { panel, close, rows };
}

function getHudCornerPosition(box, width, height, position, margin) {
  return {
    left: position.endsWith("-left") ? box.left + margin : box.right - width - margin,
    top: position.startsWith("bottom-") ? box.bottom - height - margin : box.top + margin
  };
}
