"use strict";

function applyHudAppearance(panel, settings) {
  panel.style.setProperty("--hud-font-size", `${settings.fontSize}px`);
  panel.style.setProperty("--hud-opacity", `${settings.panelOpacity}%`);
  panel.style.setProperty("--hud-background", settings.panelBackground);
  panel.style.setProperty("--hud-text", settings.panelText);
}

const hudBaseCSS = `
  .hud-typography {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: var(--hud-font-size, 11.5px);
    line-height: 1.45;
    box-sizing: border-box;
  }
  .hud-panel {
    background: color-mix(in srgb, var(--hud-background, #0f1117) var(--hud-opacity, 88%), transparent);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(56, 189, 248, 0.45);
    border-radius: 6px;
  }
  .hud-label { color: #94a3b8; font-weight: 600; }
  .hud-value { color: var(--hud-text, #38bdf8); text-align: right; }
  .info-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    margin: 0;
    background: rgba(15, 17, 23, 0.78);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(56, 189, 248, 0.45);
    border-radius: 6px;
    color: #38bdf8;
    font-size: 13px;
    cursor: pointer;
    opacity: 0.82;
    transition: opacity 0.14s ease, transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  }
  .info-badge:hover {
    opacity: 1;
    transform: scale(1.06);
    border-color: rgba(56, 189, 248, 0.85);
    box-shadow: 0 4px 14px rgba(56, 189, 248, 0.25);
  }
  .info-badge[hidden] { display: none; }

:host {
  all: initial;
}
.hud-anchor {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483647;
  pointer-events: auto;
  color: #38bdf8;
  user-select: none;
  -webkit-user-select: none;
}
.hud-hidden {
  display: none !important;
}

.hud-panel {
  min-width: 248px;
  max-width: 340px;
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
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.hud-value {
  word-break: break-word;
}

.hud-panel, .info-badge { pointer-events: auto; }
.hud-row { display: contents; }
.hud-row[hidden], .hud-panel[hidden] { display: none; }
.hud-value[data-tooltip] { position: relative; }
.hud-value[data-tooltip] {
  pointer-events: auto;
  cursor: help;
  text-decoration: underline dotted rgba(56, 189, 248, 0.5);
  text-underline-offset: 2px;
}
.hud-value[data-tooltip]:hover::after {
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
