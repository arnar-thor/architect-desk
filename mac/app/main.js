// Architect's Desk desktop shell. Offline: every page asset comes from the bundled web/ folder over the app:// scheme.
"use strict";
const { app, BrowserWindow, Menu, protocol, net, shell, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const WEB = path.join(__dirname, "web");
const ORIGIN = "app://architect";
const SITE = "https://norselabs.net/";
app.setName("Architect's Desk");

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";

// ---- window state ----
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
function loadState() {
  try { const s = JSON.parse(fs.readFileSync(stateFile(), "utf8")); if (s && s.width >= 600 && s.height >= 400) return s; } catch (e) { /* first run */ }
  return { width: 1440, height: 900 };
}
function onScreen(s) {
  if (s.x == null || s.y == null) return false;
  const { screen } = require("electron");
  return screen.getAllDisplays().some((d) => { const a = d.workArea; return s.x < a.x + a.width - 80 && s.x + s.width > a.x + 80 && s.y >= a.y - 10 && s.y < a.y + a.height - 80; });
}
function trackState(win) {
  let t = null;
  const save = () => { if (win.isDestroyed()) return; const b = win.getNormalBounds(); const s = { ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
    try { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const later = () => { clearTimeout(t); t = setTimeout(save, 400); };
  ["resize", "move", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"].forEach((ev) => win.on(ev, later));
  win.on("close", () => { clearTimeout(t); save(); });
}

// ---- menu ----
let win = null;
const send = (name) => () => { const w = BrowserWindow.getFocusedWindow() || win; if (w) w.webContents.send("menu", name); };
function buildMenu() {
  const mac = process.platform === "darwin";
  const tpl = [
    ...(mac ? [{ label: app.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "services" }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }] : []),
    { label: "File", submenu: [
      { label: "New from Template…", accelerator: "CmdOrCtrl+N", click: send("new") },
      { label: "Open JSON…", accelerator: "CmdOrCtrl+O", click: send("open") },
      { type: "separator" },
      { label: "Save JSON…", accelerator: "CmdOrCtrl+S", click: send("save-json") },
      { type: "separator" },
      { label: "Export PNG…", accelerator: "CmdOrCtrl+Shift+P", click: send("export-png") },
      { label: "Export SVG…", accelerator: "CmdOrCtrl+Shift+S", click: send("export-svg") },
      { label: "Export Terraform…", accelerator: "CmdOrCtrl+Shift+T", click: send("export-tf") },
      { type: "separator" },
      mac ? { role: "close" } : { role: "quit" },
    ] },
    { label: "Edit", submenu: [
      { label: "Undo", accelerator: "CmdOrCtrl+Z", click: send("undo") },
      { label: "Redo", accelerator: mac ? "Cmd+Shift+Z" : "Ctrl+Y", click: send("redo") },
      { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
    ] },
    { label: "View", submenu: [
      { label: "Zoom In", accelerator: "CmdOrCtrl+=", click: send("zoom-in") },
      { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: send("zoom-out") },
      { label: "Fit to Window", accelerator: "CmdOrCtrl+0", click: send("fit") },
      { type: "separator" }, { role: "togglefullscreen" },
      ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
    ] },
    { role: "windowMenu" },
    { role: "help", submenu: [
      { label: "How Architect's Desk Works", accelerator: "F1", click: send("help") },
      { label: "Norselabs Website", click: () => shell.openExternal(SITE) },
      { label: "Architect's Desk on the Web", click: () => shell.openExternal(SITE + "architect/") },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function isExternal(u) { try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === "norselabs.net" || x.hostname.endsWith(".norselabs.net")); } catch (e) { return false; } }

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width, height: st.height, ...(onScreen(st) ? { x: st.x, y: st.y } : {}),
    minWidth: 900, minHeight: 600, backgroundColor: "#0b2545", title: "Architect's Desk", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false, devTools: !app.isPackaged },
  });
  if (st.maximized) win.maximize();
  if (st.fullscreen) win.setFullScreen(true);
  trackState(win);
  win.once("ready-to-show", () => win.show());
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => { if (isExternal(url)) shell.openExternal(url); return { action: "deny" }; });
  wc.on("will-navigate", (e, url) => { if (url.startsWith(ORIGIN + "/")) return; e.preventDefault(); if (isExternal(url)) shell.openExternal(url); });
  wc.on("will-attach-webview", (e) => e.preventDefault());
  win.loadURL(ORIGIN + "/index.html" + (process.env.AD_QUERY || ""));
  win.on("closed", () => { win = null; });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  // app:// → bundled files only, with a path-traversal guard and a CSP header
  protocol.handle("app", async (req) => {
    const u = new URL(req.url);
    if (u.host !== "architect") return new Response("Not found", { status: 404 });
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.normalize(path.join(WEB, rel));
    if (!file.startsWith(WEB + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response("Not found", { status: 404 });
    const r = await net.fetch(pathToFileURL(file).toString());
    const h = new Headers(r.headers); h.set("Content-Security-Policy", CSP); h.set("X-Content-Type-Options", "nosniff");
    return new Response(r.body, { status: 200, headers: h });
  });
  // Offline by design: no network requests at all from the page
  ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_d, cb) => cb({ cancel: true }));
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "clipboard-sanitized-write"));
  ses.setPermissionCheckHandler((_wc, perm) => perm === "clipboard-sanitized-write");
  // Native save dialog for every export (PNG / SVG / JSON / Terraform)
  ses.on("will-download", (_e, item) => {
    const name = item.getFilename(); const ext = path.extname(name).slice(1).toLowerCase();
    const kinds = { png: "PNG image", svg: "SVG image", json: "Architect's Desk diagram", tf: "Terraform" };
    item.setSaveDialogOptions({ title: "Save " + (kinds[ext] || "file"), defaultPath: path.join(app.getPath("documents"), name), filters: kinds[ext] ? [{ name: kinds[ext], extensions: [ext] }] : [] });
    if (process.env.AD_SAVE_DIR) item.setSavePath(path.join(process.env.AD_SAVE_DIR, name)); // tests only
  });
  buildMenu();
  createWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("web-contents-created", (_e, wc) => { wc.on("will-attach-webview", (ev) => ev.preventDefault()); });
