/* Architect's Desk for macOS: maps native menu commands onto the same buttons the web page uses. Loaded only matters inside the app. */
(function () {
  "use strict";
  if (!window.desktop) return;
  document.documentElement.classList.add("is-desktop");
  const click = (sel) => { const el = document.querySelector(sel); if (el) el.click(); };
  const typing = () => { const a = document.activeElement; return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable); };
  const act = {
    new: () => click("#btn-templates"),
    open: () => click("#file-open"),
    "save-json": () => click('[data-act="json"]'),
    "export-png": () => click('[data-act="png"]'),
    "export-svg": () => click('[data-act="svg"]'),
    "export-tf": () => click('[data-act="tf"]'),
    undo: () => (typing() ? document.execCommand("undo") : click("#btn-undo")),
    redo: () => (typing() ? document.execCommand("redo") : click("#btn-redo")),
    "zoom-in": () => click("#btn-zoom-in"),
    "zoom-out": () => click("#btn-zoom-out"),
    fit: () => click("#btn-fit"),
    help: () => click("#btn-help"),
  };
  window.desktop.onMenu((name) => { const f = act[name]; if (f) f(); });
})();
