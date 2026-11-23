"use strict";

const playbackHudCSS = `
.info-badge { pointer-events: auto; }
.hud {
  color: #f8fafc;
  padding: 7px 22px 7px 11px;
  position: relative;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
  display: none;
  min-width: 175px;
  pointer-events: none;
}
.hud.visible {
  display: block;
}
.close-btn {
  position: absolute;
  padding: 0;
  border: 0;
  background: transparent;
  top: 3px;
  right: 5px;
  width: 14px;
  height: 14px;
  line-height: 13px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #94a3b8;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  border-radius: 3px;
}
.close-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.14);
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}
.row.hidden {
  display: none;
}
.hud-value {
  font-weight: 600;
  position: relative;
}
.hud-value.has-tooltip {
  pointer-events: auto;
  cursor: help;
  text-decoration: underline dotted rgba(56, 189, 248, 0.5);
  text-underline-offset: 2px;
}
.hud-value.has-tooltip[data-tooltip]:hover::after {
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
