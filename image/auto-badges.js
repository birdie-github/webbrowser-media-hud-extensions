"use strict";

function observeImageBadges(updateBadge) {
  const visible = new Set();
  const buttons = new Map();
  let frame = null;
  let stopped = false;

  function refresh() {
    if (stopped || frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      for (const image of visible) {
        const button = updateBadge(image, buttons.get(image));
        if (button) buttons.set(image, button);
        else removeButton(image);
      }
    });
  }

  function removeButton(image) {
    buttons.get(image)?.remove();
    buttons.delete(image);
  }

  const resize = new ResizeObserver(refresh);
  const intersection = new IntersectionObserver(entries => {
    if (stopped) return;
    for (const entry of entries) {
      const image = entry.target;
      if (entry.isIntersecting && image.isConnected) {
        visible.add(image);
        resize.observe(image);
      } else {
        visible.delete(image);
        resize.unobserve(image);
        removeButton(image);
      }
    }
    refresh();
  });

  function visitImages(node, visit) {
    if (node.nodeType !== 1) return;
    if (node.localName === "img") visit(node);
    else node.querySelectorAll("img").forEach(visit);
  }

  const mutations = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        visitImages(node, image => {
          if (image.isConnected) return;
          intersection.unobserve(image);
          resize.unobserve(image);
          visible.delete(image);
          removeButton(image);
        });
      }
      for (const node of record.addedNodes) visitImages(node, image => intersection.observe(image));
    }
    if (visible.size) refresh();
  });
  mutations.observe(document, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ["class", "style", "hidden", "src", "srcset"]
  });
  for (const image of document.images) intersection.observe(image);
  return {
    refresh,
    stop() {
      stopped = true;
      mutations.disconnect();
      intersection.disconnect();
      resize.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      for (const button of buttons.values()) button.remove();
      buttons.clear();
      visible.clear();
    }
  };
}
