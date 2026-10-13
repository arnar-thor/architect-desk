// Sandboxed preload: exposes one narrow channel for native menu commands. No Node APIs reach the page.
const { contextBridge, ipcRenderer } = require("electron");
const ALLOWED = new Set(["new", "open", "save-json", "export-png", "export-svg", "export-tf", "undo", "redo", "zoom-in", "zoom-out", "fit", "help"]);
contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  onMenu: (cb) => { ipcRenderer.on("menu", (_e, name) => { if (ALLOWED.has(name)) cb(name); }); },
});
