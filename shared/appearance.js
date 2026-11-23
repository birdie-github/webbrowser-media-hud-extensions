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
`;
