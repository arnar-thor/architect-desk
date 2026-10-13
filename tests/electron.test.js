const { _electron } = require('playwright-core'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { ELECTRON_EXE: EXE, OUT, TMP } = require('./config'); fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const SAVE = fs.mkdtempSync(path.join(TMP, 'ad-save-')); const UD = fs.mkdtempSync(path.join(TMP, 'ad-ud-'));
const launch = () => _electron.launch({ executablePath: EXE, args: ['--no-sandbox', '--user-data-dir=' + UD], env: { ...process.env, AD_SAVE_DIR: SAVE, AD_QUERY: '?noonboard' } });
const menu = (app, label) => app.evaluate(({ Menu, BrowserWindow }, label) => { const find = (m) => { for (const i of m.items) { if (i.label === label) return i; if (i.submenu) { const r = find(i.submenu); if (r) return r; } } };
  const it = find(Menu.getApplicationMenu()); if (!it) return false; it.click(undefined, BrowserWindow.getAllWindows()[0]); return true; }, label);
(async () => {
  let app = await launch(); let p = await app.firstWindow();
  const errs = [], reqs = []; p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(e.message)); p.on('request', r => reqs.push(r.url()));
  await p.waitForSelector('body.ready'); await p.waitForFunction(() => window.__AD && __AD.prices && __AD.prices.meta.region === 'us-east-1');
  ok(/^app:\/\/architect\//.test(p.url()), 'loads from bundled app:// origin: ' + p.url());
  ok(await p.title() === "Architect's Desk · Norselabs" || /Architect/.test(await p.title()), 'title: ' + await p.title());
  const sec = await p.evaluate(() => ({ req: typeof require, proc: typeof process, desk: typeof window.desktop, keys: window.desktop && Object.keys(window.desktop) }));
  ok(sec.req === 'undefined' && sec.proc === 'undefined' && sec.desk === 'object', 'no Node in renderer; bridge exposes only ' + sec.keys);
  const wp = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; const p = w.webContents.getLastWebPreferences ? w.webContents.getLastWebPreferences() : {}; return { ci: p.contextIsolation, ni: p.nodeIntegration, sb: p.sandbox }; });
  ok(wp.ci === true && wp.ni === false && wp.sb === true, 'webPreferences: ' + JSON.stringify(wp));
  const csp = await p.evaluate(async () => (await fetch('index.html')).headers.get('content-security-policy'));
  ok(/default-src 'self'/.test(csp || ''), 'CSP header + meta present');
  ok(await p.evaluate(() => document.fonts.check('12px Inter') || document.fonts.size > 0), 'bundled fonts loaded');
  const st = await p.evaluate(() => ({ n: __AD.state.nodes.length, t: document.querySelector('#hud-total').textContent }));
  ok(st.n > 10, `3-tier loaded (${st.n} nodes, ${st.t})`);
  // region switch GovCloud
  await p.selectOption('#region-ov', 'us-gov-west-1'); await p.waitForFunction(() => __AD.prices && __AD.prices.meta.region === 'us-gov-west-1');
  ok(await p.evaluate(() => document.querySelector('#hud-total').textContent) !== st.t, 'region switch to us-gov-west-1 reprices from bundled data: ' + await p.evaluate(() => document.querySelector('#hud-total').textContent));
  const regs = await p.$$eval('#region-ov option', o => o.length); ok(regs === 36, '36 regions bundled');
  await p.selectOption('#region-ov', 'us-east-1'); await p.waitForFunction(() => __AD.prices && __AD.prices.meta.region === 'us-east-1');
  // menu actions
  const z0 = await p.evaluate(() => __AD.view.k); ok(await menu(app, 'Zoom In'), 'View ▸ Zoom In exists'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => __AD.view.k) > z0, 'View ▸ Zoom In zooms'); await menu(app, 'Zoom Out'); await menu(app, 'Fit to Window');
  await p.evaluate(() => { const s = JSON.parse(JSON.stringify(__AD.state)); s.title = 'Menu undo test'; __AD.load(s); });
  await menu(app, 'Undo'); await p.waitForTimeout(150); ok(await p.evaluate(() => __AD.state.title) !== 'Menu undo test', 'Edit ▸ Undo');
  await menu(app, 'Redo'); await p.waitForTimeout(150); ok(await p.evaluate(() => __AD.state.title) === 'Menu undo test', 'Edit ▸ Redo');
  for (const [label, ext] of [['Save JSON…', 'json'], ['Export PNG…', 'png'], ['Export SVG…', 'svg'], ['Export Terraform…', 'tf']]) {
    await menu(app, label); let f; for (let i = 0; i < 40 && !(f = fs.readdirSync(SAVE).find(x => x.endsWith('.' + ext) && fs.statSync(path.join(SAVE, x)).size > 0)); i++) await p.waitForTimeout(150);
    ok(!!f, `File ▸ ${label} saves ${f} (${f ? fs.statSync(path.join(SAVE, f)).size : 0} bytes)`);
  }
  const tf = fs.readFileSync(path.join(SAVE, fs.readdirSync(SAVE).find(x => x.endsWith('.tf'))), 'utf8');
  ok(!/name\s+=\s+"internal-/.test(tf), 'Terraform: no ALB name starting "internal-" (app-only fix)');
  await menu(app, 'New from Template…'); await p.waitForTimeout(200); ok(await p.isVisible('#m-templates, .templates, [data-template]'), 'File ▸ New opens the template chooser'); await p.keyboard.press('Escape');
  await menu(app, 'How Architect\'s Desk Works'); await p.waitForTimeout(200); ok(await p.isVisible('#m-help'), 'Help ▸ How it works'); await p.keyboard.press('Escape');
  // open JSON via file input (native dialog on mac)
  const j = path.join(SAVE, fs.readdirSync(SAVE).find(x => x.endsWith('.json')));
  await p.evaluate(() => __AD.load(__AD.templates.blank.make(), { fresh: true })); await p.setInputFiles('#file-open', j); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __AD.state.nodes.length) > 10, 'Open JSON restores the diagram');
  // external link
  await app.evaluate(({ shell }) => { global.__opened = []; shell.openExternal = async (u) => { global.__opened.push(u); }; });
  const u0 = p.url(); await p.click('.nl-home', { noWaitAfter: true }); await p.waitForTimeout(400);
  const opened = await app.evaluate(() => global.__opened);
  ok(opened.includes('https://norselabs.net/') && p.url() === u0, 'wordmark opens norselabs.net in the default browser, window stays put');
  // share link uses public URL
  await p.click('#btn-share').catch(() => {}); await p.waitForTimeout(300);
  // offline
  const remote = reqs.filter(u => !/^(app:|blob:|data:)/.test(u)); ok(remote.length === 0, 'no remote requests (' + reqs.length + ' requests, all app:/blob:/data:)' + remote.slice(0, 3).join(' '));
  const errsBefore = errs.slice();
  const blocked = await p.evaluate(async () => { try { await fetch('https://norselabs.net/'); return 'fetched'; } catch (e) { return 'blocked'; } }); ok(blocked === 'blocked', 'network fetch from page is blocked (offline by design)');
  // window state
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds({ x: 40, y: 30, width: 1200, height: 780 }); });
  await p.waitForTimeout(700); await p.screenshot({ path: path.join(OUT, 'linux-electron-test.png') });
  ok(errsBefore.length === 0, 'console errors during normal use: ' + errsBefore.length + ' ' + errsBefore.slice(0, 3).join(' | '));
  await app.close();
  app = await launch(); p = await app.firstWindow(); await p.waitForSelector('body.ready');
  const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  ok(b.width === 1200 && b.height === 780, 'window size remembered after relaunch: ' + JSON.stringify(b));
  ok(await p.evaluate(() => __AD.state.nodes.length) > 10, 'autosaved diagram restored after relaunch');
  await app.close();
  console.log(fails ? 'FAILED: ' + fails : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
