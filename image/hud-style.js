"use strict";

const imageHudCSS = `
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
`;
