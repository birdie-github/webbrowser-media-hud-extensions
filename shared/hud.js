"use strict";

function createHudHost(extensionCSS) {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = hudBaseCSS + extensionCSS;
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
